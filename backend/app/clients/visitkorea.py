from __future__ import annotations

from datetime import date, datetime
from typing import Any
from urllib.parse import unquote

from app.clients.errors import UpstreamDecodeError, UpstreamProviderError
from app.clients.http import AsyncJsonClient, QueryValue
from app.core.config import Settings
from app.domain.models import EventCandidate
from app.schemas.travel_plan import Coordinate, EventType

KOR_SERVICE_URL = "https://apis.data.go.kr/B551011/KorService2"
DATA_LAB_SERVICE_URL = "https://apis.data.go.kr/B551011/DataLabService"
CONCENTRATION_SERVICE_URL = "https://apis.data.go.kr/B551011/TatsCnctrRateService"


class VisitKoreaClient:
    def __init__(self, http_client: AsyncJsonClient, settings: Settings) -> None:
        self._http = http_client
        self._settings = settings

    async def location_based_list(
        self,
        coordinate: Coordinate,
        radius_meters: int,
        platform: str,
    ) -> list[EventCandidate]:
        payload = await self._get_kor(
            "locationBasedList2",
            platform,
            {
                "mapX": coordinate.lon,
                "mapY": coordinate.lat,
                "radius": radius_meters,
                "contentTypeId": 15,
                "arrange": "E",
                "numOfRows": self._settings.max_events_per_analysis,
                "pageNo": 1,
            },
        )
        return [self._candidate_from_item(item) for item in self._items(payload)]

    async def search_festivals(
        self,
        start_date: date,
        end_date: date,
        platform: str,
    ) -> list[EventCandidate]:
        payload = await self._get_kor(
            "searchFestival2",
            platform,
            {
                "eventStartDate": start_date.strftime("%Y%m%d"),
                "eventEndDate": end_date.strftime("%Y%m%d"),
                "numOfRows": self._settings.max_events_per_analysis,
                "pageNo": 1,
                "arrange": "A",
            },
        )
        return [self._candidate_from_item(item) for item in self._items(payload)]

    async def enrich(self, candidate: EventCandidate, platform: str) -> EventCandidate:
        common_payload = await self._get_kor(
            "detailCommon2",
            platform,
            {"contentId": candidate.content_id, "numOfRows": 1, "pageNo": 1},
        )
        intro_payload = await self._get_kor(
            "detailIntro2",
            platform,
            {
                "contentId": candidate.content_id,
                "contentTypeId": candidate.content_type_id,
                "numOfRows": 1,
                "pageNo": 1,
            },
        )
        common = self._single_item(common_payload) or {}
        intro = self._single_item(intro_payload) or {}
        values = candidate.model_dump()
        values.update(
            {
                "title": self._string(common.get("title")) or candidate.title,
                "address": self._join_address(common) or candidate.address,
                "location": self._coordinate_from_item(common) or candidate.location,
                "source_url": self._url(
                    intro.get("eventhomepage")
                    or common.get("homepage")
                    or common.get("eventhomepage")
                )
                or candidate.source_url,
                "start_date": self._date(
                    intro.get("eventstartdate") or common.get("eventstartdate")
                )
                or candidate.start_date,
                "end_date": self._date(intro.get("eventenddate") or common.get("eventenddate"))
                or candidate.end_date,
                "venue": self._string(intro.get("eventplace")) or candidate.venue,
                "detail_loaded": True,
            }
        )
        return EventCandidate(**values)

    async def _get_kor(
        self,
        endpoint: str,
        platform: str,
        params: dict[str, str | int | float],
    ) -> dict[str, Any]:
        query = self._common_params(platform)
        query.update(params)
        payload = await self._http.get_json(
            "visitkorea",
            f"{KOR_SERVICE_URL}/{endpoint}",
            params=query,
        )
        return self._validate_response(payload)

    def _common_params(self, platform: str) -> dict[str, QueryValue]:
        key = unquote(self._settings.data_go_kr_service_key.get_secret_value().strip())
        return {
            "MobileOS": platform,
            "MobileApp": self._settings.mobile_app_name,
            "serviceKey": key,
            "_type": "json",
        }

    @staticmethod
    def _validate_response(payload: dict[str, Any]) -> dict[str, Any]:
        response = payload.get("response")
        if not isinstance(response, dict):
            raise UpstreamDecodeError("visitkorea")
        header = response.get("header")
        if not isinstance(header, dict):
            raise UpstreamDecodeError("visitkorea")
        if str(header.get("resultCode")) != "0000":
            raise UpstreamProviderError("visitkorea", str(header.get("resultCode")))
        body = response.get("body")
        if not isinstance(body, dict):
            raise UpstreamDecodeError("visitkorea")
        return body

    @classmethod
    def _items(cls, body: dict[str, Any]) -> list[dict[str, Any]]:
        items = body.get("items")
        if items is None:
            return []
        if not isinstance(items, dict):
            raise UpstreamDecodeError("visitkorea")
        raw_items = items.get("item", [])
        if raw_items is None:
            return []
        if isinstance(raw_items, dict):
            return [raw_items]
        if isinstance(raw_items, list) and all(isinstance(item, dict) for item in raw_items):
            return raw_items
        raise UpstreamDecodeError("visitkorea")

    @classmethod
    def _single_item(cls, body: dict[str, Any]) -> dict[str, Any] | None:
        items = cls._items(body)
        return items[0] if items else None

    @classmethod
    def _candidate_from_item(cls, item: dict[str, Any]) -> EventCandidate:
        content_id = cls._string(item.get("contentid"))
        title = cls._string(item.get("title"))
        if not content_id or not title:
            raise UpstreamDecodeError("visitkorea")
        return EventCandidate(
            content_id=content_id,
            title=title,
            start_date=cls._date(item.get("eventstartdate")),
            end_date=cls._date(item.get("eventenddate")),
            venue=cls._string(item.get("eventplace")),
            address=cls._join_address(item),
            location=cls._coordinate_from_item(item),
            event_type=EventType.FESTIVAL,
            source_url=cls._url(item.get("homepage") or item.get("eventhomepage")),
        )

    @classmethod
    def _coordinate_from_item(cls, item: dict[str, Any]) -> Coordinate | None:
        lon = cls._float(item.get("mapx"))
        lat = cls._float(item.get("mapy"))
        if lon is None or lat is None:
            return None
        if not -180 <= lon <= 180 or not -90 <= lat <= 90:
            return None
        return Coordinate(lat=lat, lon=lon)

    @staticmethod
    def _join_address(item: dict[str, Any]) -> str | None:
        parts = [str(item.get(key)).strip() for key in ("addr1", "addr2") if item.get(key)]
        return " ".join(parts) or None

    @staticmethod
    def _string(value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @staticmethod
    def _float(value: Any) -> float | None:
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @classmethod
    def _date(cls, value: Any) -> date | None:
        text = cls._string(value)
        if not text:
            return None
        try:
            return (
                date.fromisoformat(text)
                if "-" in text
                else datetime.strptime(text, "%Y%m%d").date()
            )
        except ValueError:
            return None

    @classmethod
    def _url(cls, value: Any) -> str | None:
        text = cls._string(value)
        if text and text.startswith(("http://", "https://")):
            return text
        return None

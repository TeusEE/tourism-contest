from __future__ import annotations

from datetime import date, datetime
from typing import Any
from urllib.parse import unquote
from zoneinfo import ZoneInfo

from app.clients.errors import UpstreamDecodeError, UpstreamError, UpstreamProviderError
from app.clients.http import AsyncJsonClient, QueryValue
from app.core.config import Settings
from app.schemas.travel_plan import VisitorReference, VisitorStatus

DATA_LAB_URL = "https://apis.data.go.kr/B551011/DataLabService"
CONCENTRATION_URL = "https://apis.data.go.kr/B551011/TatsCnctrRateService"
KST = ZoneInfo("Asia/Seoul")


class VisitorClient:
    def __init__(self, http_client: AsyncJsonClient, settings: Settings) -> None:
        self._http = http_client
        self._settings = settings

    async def get_reference(
        self,
        travel_date: date,
        region_name: str | None,
        platform: str,
        *,
        now: datetime | None = None,
    ) -> VisitorReference:
        reference_date = choose_reference_date(travel_date, now=now)
        try:
            body = await self._get_data_lab(
                "locgoRegnVisitrDDList",
                platform,
                {
                    "startYmd": reference_date.strftime("%Y%m%d"),
                    "endYmd": reference_date.strftime("%Y%m%d"),
                    "numOfRows": 1000,
                    "pageNo": 1,
                },
            )
        except UpstreamError:
            return self._failed_reference()

        items = self._items(body)
        item = self._select_region(items, region_name)
        if item is None:
            return VisitorReference(
                status=VisitorStatus.NO_DATA,
                referenceDate=reference_date,
                region=region_name,
                visitorCount=None,
                concentrationRate=None,
                isForecast=False,
                sourceName="한국관광공사 데이터랩",
                note="해당 기준일의 시군구 방문객 참고값이 없습니다.",
            )

        visitor_count = self._integer(item.get("touNum"))
        concentration_rate: float | None = None
        region_codes = self._region_codes(item)
        if region_codes is not None:
            concentration_rate = await self.get_concentration_rate(
                region_codes[0],
                region_codes[1],
                platform,
            )
        status = (
            VisitorStatus.AVAILABLE
            if visitor_count is not None or concentration_rate is not None
            else VisitorStatus.NO_DATA
        )
        return VisitorReference(
            status=status,
            referenceDate=self._date(item.get("baseYmd")) or reference_date,
            region=self._string(item.get("signguNm")) or region_name,
            visitorCount=visitor_count,
            concentrationRate=concentration_rate,
            isForecast=False,
            sourceName="한국관광공사 데이터랩",
            note=(
                "방문객 수는 과거 참고값이며, 집중률은 관광공사의 상대 지표입니다. "
                "여행일의 미래 방문객 수 예측이 아닙니다."
            ),
        )

    async def get_concentration_rate(
        self,
        area_code: str,
        signgu_code: str,
        platform: str,
    ) -> float | None:
        try:
            body = await self._get_concentration(
                platform,
                {"areaCd": area_code, "signguCd": signgu_code, "numOfRows": 100, "pageNo": 1},
            )
        except UpstreamError:
            return None
        items = self._items(body)
        for item in items:
            rate = self._float(item.get("cnctrRate"))
            if rate is not None:
                return max(0.0, min(100.0, rate))
        return None

    async def _get_data_lab(
        self,
        endpoint: str,
        platform: str,
        params: dict[str, str | int],
    ) -> dict[str, Any]:
        query = self._common_params(platform)
        query.update(params)
        payload = await self._http.get_json(
            "visitkorea-visitor",
            f"{DATA_LAB_URL}/{endpoint}",
            params=query,
        )
        return self._validate_response(payload, "visitkorea-visitor")

    async def _get_concentration(
        self,
        platform: str,
        params: dict[str, str | int],
    ) -> dict[str, Any]:
        query = self._common_params(platform)
        query.update(params)
        payload = await self._http.get_json(
            "visitkorea-concentration",
            f"{CONCENTRATION_URL}/tatsCnctrRatedList",
            params=query,
        )
        return self._validate_response(payload, "visitkorea-concentration")

    def _common_params(self, platform: str) -> dict[str, QueryValue]:
        return {
            "MobileOS": platform,
            "MobileApp": self._settings.mobile_app_name,
            "serviceKey": unquote(self._settings.data_go_kr_service_key.get_secret_value().strip()),
            "_type": "json",
        }

    @staticmethod
    def _validate_response(payload: dict[str, Any], provider: str) -> dict[str, Any]:
        response = payload.get("response")
        if not isinstance(response, dict):
            raise UpstreamDecodeError(provider)
        header = response.get("header")
        body = response.get("body")
        if not isinstance(header, dict) or not isinstance(body, dict):
            raise UpstreamDecodeError(provider)
        if str(header.get("resultCode")) != "0000":
            raise UpstreamProviderError(provider, str(header.get("resultCode")))
        return body

    @staticmethod
    def _items(body: dict[str, Any]) -> list[dict[str, Any]]:
        items = body.get("items")
        if not isinstance(items, dict):
            return []
        raw = items.get("item", [])
        if raw is None:
            return []
        if isinstance(raw, dict):
            return [raw]
        return [item for item in raw if isinstance(item, dict)] if isinstance(raw, list) else []

    @classmethod
    def _select_region(
        cls,
        items: list[dict[str, Any]],
        region_name: str | None,
    ) -> dict[str, Any] | None:
        if not items:
            return None
        if not region_name:
            return items[0] if len(items) == 1 else None
        target = cls._normalize(region_name)
        matches = [
            item
            for item in items
            if cls._normalize(cls._string(item.get("signguNm")) or "") in target
            or target in cls._normalize(cls._string(item.get("signguNm")) or "")
        ]
        return matches[0] if matches else None

    @classmethod
    def _region_codes(cls, item: dict[str, Any]) -> tuple[str, str] | None:
        """Map the data-lab district code to the area/signgu pair used by concentration API."""

        signgu_code = cls._string(item.get("signguCd") or item.get("signguCode"))
        if not signgu_code:
            return None
        area_code = cls._string(item.get("areaCd") or item.get("areaCode"))
        if area_code is None and len(signgu_code) >= 2:
            # Korean administrative district codes use the first two digits as
            # the province/metropolitan-city area code.
            area_code = signgu_code[:2]
        return (area_code, signgu_code) if area_code else None

    @staticmethod
    def _normalize(value: str) -> str:
        return "".join(value.split()).lower()

    @staticmethod
    def _string(value: Any) -> str | None:
        if value is None:
            return None
        value = str(value).strip()
        return value or None

    @classmethod
    def _integer(cls, value: Any) -> int | None:
        text = cls._string(value)
        if not text:
            return None
        try:
            return int(text.replace(",", ""))
        except ValueError:
            return None

    @classmethod
    def _float(cls, value: Any) -> float | None:
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
            return datetime.strptime(text, "%Y%m%d").date()
        except ValueError:
            return None

    @staticmethod
    def _failed_reference() -> VisitorReference:
        return VisitorReference(
            status=VisitorStatus.FAILED,
            referenceDate=None,
            region=None,
            visitorCount=None,
            concentrationRate=None,
            isForecast=False,
            sourceName="한국관광공사 데이터랩",
            note="방문객 참고값을 불러오지 못했습니다.",
        )


def choose_reference_date(travel_date: date, *, now: datetime | None = None) -> date:
    current_date = (now or datetime.now(KST)).astimezone(KST).date()
    if travel_date <= current_date:
        return travel_date
    try:
        return travel_date.replace(year=travel_date.year - 1)
    except ValueError:
        return travel_date.replace(year=travel_date.year - 1, day=28)

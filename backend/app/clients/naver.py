from __future__ import annotations

import re
from collections.abc import Mapping
from html import unescape
from typing import Any

from app.clients.errors import (
    LocationNotFoundError,
    ProviderConfigurationError,
    RouteNotFoundError,
    UpstreamDecodeError,
    UpstreamError,
    UpstreamProviderError,
)
from app.clients.http import AsyncJsonClient
from app.core.config import Settings
from app.domain.models import GeocodedLocation, LocationCandidate, RouteData
from app.schemas.travel_plan import Coordinate

GEOCODE_URL = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode"
DIRECTIONS_URL = "https://maps.apigw.ntruss.com/map-direction/v1/driving"
LOCAL_SEARCH_URL = "https://naverapihub.apigw.ntruss.com/search/v1/local"


class NaverMapsClient:
    def __init__(self, http_client: AsyncJsonClient, settings: Settings) -> None:
        self._http = http_client
        self._settings = settings

    def _headers(self) -> Mapping[str, str]:
        return self._headers_for_credentials(
            self._settings.ncp_maps_client_id,
            self._settings.ncp_maps_client_secret,
            "naver",
        )

    def _local_search_headers(self) -> Mapping[str, str]:
        client_id = self._settings.ncp_local_search_client_id
        client_secret = self._settings.ncp_local_search_client_secret
        if client_id is None and client_secret is None:
            # Keep local development compatible with the original setup where
            # Maps and NAVER API HUB used the same application credentials.
            return self._headers()
        if client_id is None or client_secret is None:
            raise ProviderConfigurationError("naver-local-search")
        return self._headers_for_credentials(client_id, client_secret, "naver-local-search")

    @staticmethod
    def _headers_for_credentials(
        client_id: Any,
        client_secret: Any,
        provider: str,
    ) -> Mapping[str, str]:
        if client_id is None or client_secret is None:
            raise ProviderConfigurationError(provider)
        client_id_value = client_id.get_secret_value().strip()
        client_secret_value = client_secret.get_secret_value().strip()
        if not client_id_value or not client_secret_value:
            raise ProviderConfigurationError(provider)
        return {
            "X-NCP-APIGW-API-KEY-ID": client_id_value,
            "X-NCP-APIGW-API-KEY": client_secret_value,
        }

    async def geocode(self, query: str) -> GeocodedLocation:
        payload = await self._http.get_json(
            "naver",
            GEOCODE_URL,
            params={"query": query},
            headers=self._headers(),
        )
        addresses = payload.get("addresses")
        if not isinstance(addresses, list):
            raise UpstreamDecodeError("naver")
        if not addresses:
            # Geocoding is address-oriented. Place names such as "서울역" are
            # resolved through NAVER Local Search as a fallback, while keeping
            # the existing address path as the cheap first attempt.
            try:
                candidates = await self.local_search(query, limit=5)
            except UpstreamError:
                candidates = []
            selected = self._select_local_candidate(query, candidates)
            if selected is None:
                raise LocationNotFoundError()
            return GeocodedLocation(
                coordinate=selected.coordinate,
                address=selected.road_address or selected.address or selected.name,
                candidate_count=len(candidates),
            )

        first = addresses[0]
        if not isinstance(first, dict):
            raise UpstreamDecodeError("naver")
        coordinate = self._coordinate_from_values(first.get("x"), first.get("y"))
        if coordinate is None:
            raise UpstreamDecodeError("naver")
        address = self._as_optional_string(first.get("roadAddress")) or self._as_optional_string(
            first.get("jibunAddress")
        )
        return GeocodedLocation(
            coordinate=coordinate,
            address=address,
            candidate_count=len(addresses),
        )

    async def local_search(self, query: str, *, limit: int = 5) -> list[LocationCandidate]:
        display = max(1, min(limit, 5))
        payload = await self._http.get_json(
            "naver-local-search",
            LOCAL_SEARCH_URL,
            params={
                "query": query,
                "display": display,
                "start": 1,
                "sort": "random",
                "format": "json",
            },
            headers=self._local_search_headers(),
        )
        items = payload.get("items")
        if not isinstance(items, list):
            raise UpstreamDecodeError("naver-local-search")

        candidates: list[LocationCandidate] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            name = self._clean_search_text(item.get("title"))
            address = self._clean_search_text(item.get("address"))
            road_address = self._clean_search_text(item.get("roadAddress"))
            coordinate = self._local_search_coordinate(item.get("mapx"), item.get("mapy"))
            if name is None or coordinate is None:
                continue
            candidates.append(
                LocationCandidate(
                    name=name,
                    address=address,
                    road_address=road_address,
                    coordinate=coordinate,
                )
            )
        return candidates

    async def directions(self, origin: Coordinate, destination: Coordinate) -> RouteData:
        start = f"{origin.lon},{origin.lat}"
        goal = f"{destination.lon},{destination.lat}"
        payload = await self._http.get_json(
            "naver",
            DIRECTIONS_URL,
            params={"start": start, "goal": goal, "option": "traoptimal"},
            headers=self._headers(),
        )
        if payload.get("code") not in (None, 0):
            raise UpstreamProviderError("naver", str(payload.get("code")))

        route_groups = payload.get("route")
        if not isinstance(route_groups, dict):
            raise RouteNotFoundError()
        routes = route_groups.get("traoptimal") or route_groups.get("tracomfort")
        if not isinstance(routes, list) or not routes:
            raise RouteNotFoundError()
        first = routes[0]
        if not isinstance(first, dict):
            raise UpstreamDecodeError("naver")
        summary = first.get("summary")
        path = first.get("path")
        if not isinstance(summary, dict) or not isinstance(path, list) or not path:
            raise RouteNotFoundError()

        polyline: list[Coordinate] = []
        for item in path:
            if not isinstance(item, list) or len(item) != 2:
                raise UpstreamDecodeError("naver")
            coordinate = self._coordinate_from_values(item[0], item[1])
            if coordinate is None:
                raise UpstreamDecodeError("naver")
            polyline.append(coordinate)

        distance = self._as_nonnegative_int(summary.get("distance"))
        duration_millis = self._as_nonnegative_int(summary.get("duration"))
        if distance is None or duration_millis is None:
            raise UpstreamDecodeError("naver")
        return RouteData(
            origin=origin,
            destination=destination,
            distance_meters=distance,
            duration_seconds=round(duration_millis / 1000),
            polyline=polyline,
        )

    @staticmethod
    def _coordinate_from_values(x_value: Any, y_value: Any) -> Coordinate | None:
        try:
            lon = float(x_value)
            lat = float(y_value)
        except (TypeError, ValueError):
            return None
        if not -180 <= lon <= 180 or not -90 <= lat <= 90:
            return None
        return Coordinate(lat=lat, lon=lon)

    @classmethod
    def _local_search_coordinate(cls, x_value: Any, y_value: Any) -> Coordinate | None:
        """Parse Local Search coordinates, which are often 1e7-scaled integers."""
        try:
            lon = float(x_value)
            lat = float(y_value)
        except (TypeError, ValueError):
            return None
        if abs(lon) > 180 or abs(lat) > 90:
            lon /= 10_000_000
            lat /= 10_000_000
        return cls._coordinate_from_values(lon, lat)

    @staticmethod
    def _as_optional_string(value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @staticmethod
    def _clean_search_text(value: Any) -> str | None:
        text = NaverMapsClient._as_optional_string(value)
        if text is None:
            return None
        cleaned = re.sub(r"<[^>]+>", "", unescape(text)).strip()
        return cleaned or None

    @staticmethod
    def _select_local_candidate(
        query: str,
        candidates: list[LocationCandidate],
    ) -> LocationCandidate | None:
        if len(candidates) == 1:
            return candidates[0]
        normalized_query = re.sub(r"\s+", "", query).casefold()
        exact_matches = [
            candidate
            for candidate in candidates
            if re.sub(r"\s+", "", candidate.name).casefold() == normalized_query
        ]
        return exact_matches[0] if len(exact_matches) == 1 else None

    @staticmethod
    def _as_nonnegative_int(value: Any) -> int | None:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return None
        return parsed if parsed >= 0 else None

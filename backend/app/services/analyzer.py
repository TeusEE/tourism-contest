from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import date, datetime
from typing import Protocol
from zoneinfo import ZoneInfo

from app.api.errors import AnalysisError
from app.clients.errors import LocationNotFoundError, UpstreamError
from app.core.config import Settings
from app.domain.congestion import build_event_density_summary
from app.domain.events import deduplicate_candidates, normalize_candidates
from app.domain.models import EventCandidate, GeocodedLocation, RouteData
from app.schemas.travel_plan import (
    Coordinate,
    RouteSummary,
    TravelPlanAnalysisResponse,
    TravelPlanRequest,
    VisitorReference,
    VisitorStatus,
    Warning,
    WarningScope,
    WarningSeverity,
    WeatherStatus,
    WeatherSummary,
)

KST = ZoneInfo("Asia/Seoul")


class Geocoder(Protocol):
    async def geocode(self, query: str) -> GeocodedLocation: ...


class Router(Protocol):
    async def directions(self, origin: Coordinate, destination: Coordinate) -> RouteData: ...


class EventProvider(Protocol):
    async def location_based_list(
        self, coordinate: Coordinate, radius_meters: int, platform: str
    ) -> list[EventCandidate]: ...

    async def search_festivals(
        self, start_date: date, end_date: date, platform: str
    ) -> list[EventCandidate]: ...

    async def enrich(self, candidate: EventCandidate, platform: str) -> EventCandidate: ...


class VisitorProvider(Protocol):
    async def get_reference(
        self, travel_date: date, region_name: str | None, platform: str
    ) -> VisitorReference: ...


class WeatherProvider(Protocol):
    async def get_forecast(self, coordinate: Coordinate, target_date: date) -> WeatherSummary: ...


class TravelPlanAnalyzer:
    def __init__(
        self,
        settings: Settings,
        geocoder: Geocoder,
        router: Router,
        event_provider: EventProvider,
        visitor_provider: VisitorProvider,
        weather_provider: WeatherProvider,
        *,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._settings = settings
        self._geocoder = geocoder
        self._router = router
        self._events = event_provider
        self._visitor = visitor_provider
        self._weather = weather_provider
        self._clock = clock or (lambda: datetime.now(KST))

    async def analyze(self, request: TravelPlanRequest) -> TravelPlanAnalysisResponse:
        try:
            async with asyncio.timeout(self._settings.request_timeout_seconds):
                return await self._analyze(request)
        except TimeoutError as exc:
            raise AnalysisError(
                "ANALYSIS_TIMEOUT",
                "분석 시간이 제한을 초과했습니다.",
                504,
            ) from exc

    async def _analyze(self, request: TravelPlanRequest) -> TravelPlanAnalysisResponse:
        checked_at = self._clock().astimezone(KST)
        origin = await self._resolve_location(request.origin, "출발지")
        destination = await self._resolve_location(request.destination, "여행지")
        try:
            route = await self._router.directions(origin.coordinate, destination.coordinate)
        except UpstreamError as exc:
            raise AnalysisError(
                "ROUTE_UNAVAILABLE",
                "자동차 경로를 확인하지 못했습니다.",
                502,
            ) from exc

        # Event discovery is intentionally destination-only. The route remains
        # available for the map and travel metrics, but it is not sampled for
        # repeated event-provider calls.
        (candidates, warnings, count_is_capped), (visitor, visitor_warning), (
            weather,
            weather_warning,
        ) = await asyncio.gather(
            self._collect_destination_events(request, destination.coordinate),
            self._collect_visitor(request, destination),
            self._collect_weather(request, destination),
        )
        normalized_events = normalize_candidates(
            candidates,
            request.travel_date,
            [],
            destination.coordinate,
            request.route_buffer_meters,
            request.destination_radius_meters,
            request.event_keywords,
            checked_at,
        )
        verified_event_count = sum(
            event.location is not None for event in normalized_events
        )
        nearby_event_count: int | None = verified_event_count
        count_is_capped = count_is_capped and (
            verified_event_count >= self._settings.max_events_per_analysis
        )
        if any(warning.code == "EVENTS_PROVIDER_FAILED" for warning in warnings):
            nearby_event_count = None

        if visitor_warning is not None:
            warnings.append(visitor_warning)
        if weather_warning is not None:
            warnings.append(weather_warning)

        return TravelPlanAnalysisResponse(
            travelDate=request.travel_date,
            route=RouteSummary(
                origin=route.origin,
                destination=route.destination,
                distanceMeters=route.distance_meters,
                durationSeconds=route.duration_seconds,
                polyline=route.polyline,
            ),
            congestion=build_event_density_summary(
                nearby_event_count,
                radius_meters=request.destination_radius_meters,
                count_is_capped=count_is_capped,
            ),
            # Event detail retrieval is intentionally deferred to a later flow.
            events=[],
            nearbyEventCount=nearby_event_count,
            nearbyEventCountIsCapped=count_is_capped,
            visitorReference=visitor,
            weather=weather,
            warnings=warnings,
            generatedAt=checked_at,
        )

    async def _resolve_location(
        self,
        location: str | Coordinate,
        label: str,
    ) -> GeocodedLocation:
        if isinstance(location, Coordinate):
            return GeocodedLocation(coordinate=location, candidate_count=1)
        try:
            return await self._geocoder.geocode(location.strip())
        except LocationNotFoundError as exc:
            raise AnalysisError(
                "LOCATION_NOT_FOUND",
                f"{label}를 확인하지 못했습니다.",
                422,
            ) from exc
        except UpstreamError as exc:
            raise AnalysisError(
                "ROUTE_UNAVAILABLE",
                "주소를 좌표로 변환하지 못했습니다.",
                502,
            ) from exc

    async def _collect_destination_events(
        self,
        request: TravelPlanRequest,
        destination: Coordinate,
    ) -> tuple[list[EventCandidate], list[Warning], bool]:
        platform = request.client_platform.value
        warnings: list[Warning] = []
        try:
            candidates = await self._events.location_based_list(
                destination,
                request.destination_radius_meters,
                platform,
            )
        except UpstreamError:
            candidates = []
            warnings.append(
                _warning(
                    "EVENTS_PROVIDER_FAILED",
                    WarningScope.EVENTS,
                    WarningSeverity.WARNING,
                    "행사 정보를 불러오지 못해 경로와 부가 정보만 제공했습니다.",
                )
            )

        count_is_capped = len(candidates) >= self._settings.max_events_per_analysis
        candidates = deduplicate_candidates(candidates)[: self._settings.max_events_per_analysis]
        # The location-based response is enough for date, keyword, radius, and
        # duplicate filtering. detailCommon2/detailIntro2 are intentionally
        # deferred until the user asks for event details.
        return candidates, warnings, count_is_capped

    async def _collect_visitor(
        self,
        request: TravelPlanRequest,
        destination: GeocodedLocation,
    ) -> tuple[VisitorReference, Warning | None]:
        region_name = destination.address
        try:
            visitor = await self._visitor.get_reference(
                request.travel_date,
                region_name,
                request.client_platform.value,
            )
        except UpstreamError:
            visitor = _failed_visitor()
        warning = None
        if visitor.status is VisitorStatus.FAILED:
            warning = _warning(
                "VISITOR_FAILED",
                WarningScope.VISITOR,
                WarningSeverity.INFO,
                "방문객 참고값을 불러오지 못했습니다.",
            )
        elif visitor.status is VisitorStatus.NO_DATA:
            warning = _warning(
                "VISITOR_NO_DATA",
                WarningScope.VISITOR,
                WarningSeverity.INFO,
                "표시할 방문객 참고값이 없습니다.",
            )
        return visitor, warning

    async def _collect_weather(
        self,
        request: TravelPlanRequest,
        destination: GeocodedLocation,
    ) -> tuple[WeatherSummary, Warning | None]:
        try:
            weather = await self._weather.get_forecast(
                destination.coordinate,
                request.travel_date,
            )
        except UpstreamError:
            weather = _failed_weather(request.travel_date, self._clock().astimezone(KST))
        warning = None
        if weather.status is WeatherStatus.FAILED:
            warning = _warning(
                "WEATHER_FAILED",
                WarningScope.WEATHER,
                WarningSeverity.INFO,
                "날씨 정보를 불러오지 못했습니다.",
            )
        elif weather.status is WeatherStatus.NOT_YET_PUBLISHED:
            warning = _warning(
                "WEATHER_NOT_YET_PUBLISHED",
                WarningScope.WEATHER,
                WarningSeverity.INFO,
                "여행일의 단기예보가 아직 발표되지 않았습니다.",
            )
        elif weather.status is WeatherStatus.NO_DATA:
            warning = _warning(
                "WEATHER_NO_DATA",
                WarningScope.WEATHER,
                WarningSeverity.INFO,
                "표시할 날씨 정보가 없습니다.",
            )
        return weather, warning


def _warning(
    code: str,
    scope: WarningScope,
    severity: WarningSeverity,
    message: str,
) -> Warning:
    return Warning(code=code, scope=scope, severity=severity, message=message, eventId=None)


def _failed_visitor() -> VisitorReference:
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


def _failed_weather(target_date: date, checked_at: datetime) -> WeatherSummary:
    return WeatherSummary(
        status=WeatherStatus.FAILED,
        targetDate=target_date,
        summary=None,
        forecasts=[],
        note="날씨 정보를 불러오지 못했습니다.",
        checkedAt=checked_at,
    )

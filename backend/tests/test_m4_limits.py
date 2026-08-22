from __future__ import annotations

import asyncio
from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from app.api.errors import AnalysisError
from app.core.config import Settings
from app.domain.models import EventCandidate, GeocodedLocation, RouteData
from app.schemas.travel_plan import Coordinate, TravelPlanRequest, VisitorReference, VisitorStatus
from app.services.analyzer import TravelPlanAnalyzer

KST = ZoneInfo("Asia/Seoul")
ORIGIN = Coordinate(lat=37.5665, lon=126.978)
DESTINATION = Coordinate(lat=35.1796, lon=129.0756)


class CountingGeocoder:
    async def geocode(self, query: str) -> GeocodedLocation:
        return GeocodedLocation(coordinate=ORIGIN, address=query, candidate_count=1)


class LongRoute:
    async def directions(self, origin: Coordinate, destination: Coordinate) -> RouteData:
        polyline = [
            Coordinate(
                lat=ORIGIN.lat + (DESTINATION.lat - ORIGIN.lat) * index / 20,
                lon=ORIGIN.lon + (DESTINATION.lon - ORIGIN.lon) * index / 20,
            )
            for index in range(21)
        ]
        return RouteData(
            origin=origin,
            destination=DESTINATION,
            distance_meters=400_000,
            duration_seconds=18_000,
            polyline=polyline,
        )


class CountingEvents:
    def __init__(self) -> None:
        self.location_calls = 0
        self.festival_calls = 0
        self.enrich_calls = 0
        self.location_requests: list[tuple[Coordinate, int]] = []

    async def location_based_list(
        self, coordinate: Coordinate, radius_meters: int, platform: str
    ) -> list[EventCandidate]:
        self.location_calls += 1
        self.location_requests.append((coordinate, radius_meters))
        return [self._candidate(f"location-{self.location_calls}", coordinate)]

    async def search_festivals(
        self, start_date: date, end_date: date, platform: str
    ) -> list[EventCandidate]:
        self.festival_calls += 1
        return [
            self._candidate(f"festival-{index}", ORIGIN)
            for index in range(10)
        ]

    async def enrich(self, candidate: EventCandidate, platform: str) -> EventCandidate:
        self.enrich_calls += 1
        return candidate.model_copy(update={"detail_loaded": True})

    @staticmethod
    def _candidate(content_id: str, coordinate: Coordinate) -> EventCandidate:
        return EventCandidate(
            content_id=content_id,
            title=f"행사 {content_id}",
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 31),
            venue="테스트 행사장",
            location=coordinate,
            source_url=f"https://example.com/{content_id}",
        )


class AvailableVisitor:
    async def get_reference(
        self, travel_date: date, region_name: str | None, platform: str
    ) -> VisitorReference:
        return VisitorReference(
            status=VisitorStatus.NO_DATA,
            referenceDate=None,
            region=region_name,
            visitorCount=None,
            concentrationRate=None,
            isForecast=False,
            sourceName="한국관광공사 데이터랩",
            note="참고값 없음",
        )


class AvailableWeather:
    async def get_forecast(self, coordinate: Coordinate, target_date: date):
        from app.schemas.travel_plan import WeatherStatus, WeatherSummary

        return WeatherSummary(
            status=WeatherStatus.NO_DATA,
            targetDate=target_date,
            summary=None,
            forecasts=[],
            note="참고값 없음",
            checkedAt=datetime(2026, 8, 12, 12, tzinfo=KST),
        )


class SlowWeather(AvailableWeather):
    async def get_forecast(self, coordinate: Coordinate, target_date: date):
        await asyncio.sleep(0.05)
        return await super().get_forecast(coordinate, target_date)


def make_request() -> TravelPlanRequest:
    return TravelPlanRequest.model_validate(
        {
            "travelDate": "2026-08-12",
            "origin": ORIGIN.model_dump(),
            "destination": DESTINATION.model_dump(),
            "clientPlatform": "AND",
        }
    )


def make_analyzer(
    events: CountingEvents,
    weather: AvailableWeather | SlowWeather,
    *,
    timeout: float = 1,
) -> TravelPlanAnalyzer:
    settings = Settings(
        _env_file=None,
        data_go_kr_service_key="test-key",
        max_events_per_analysis=7,
        request_timeout_seconds=timeout,
    )
    return TravelPlanAnalyzer(
        settings,
        CountingGeocoder(),
        LongRoute(),
        events,
        AvailableVisitor(),
        weather,
        clock=lambda: datetime(2026, 8, 12, 12, tzinfo=KST),
    )


def test_analysis_searches_only_the_destination_radius() -> None:
    events = CountingEvents()
    response = asyncio.run(make_analyzer(events, AvailableWeather()).analyze(make_request()))

    assert response.events == []
    assert response.nearby_event_count == 1
    assert response.nearby_event_count_is_capped is False
    assert events.location_calls == 1
    assert events.location_requests == [(DESTINATION, 15_000)]
    assert events.festival_calls == 0
    assert events.enrich_calls == 0


def test_analysis_timeout_is_converted_to_safe_504_error() -> None:
    analyzer = make_analyzer(CountingEvents(), SlowWeather(), timeout=0.001)

    with pytest.raises(AnalysisError, match="ANALYSIS_TIMEOUT") as raised:
        asyncio.run(analyzer.analyze(make_request()))

    assert raised.value.status_code == 504
    assert raised.value.message == "분석 시간이 제한을 초과했습니다."

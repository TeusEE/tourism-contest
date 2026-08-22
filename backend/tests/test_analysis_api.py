from __future__ import annotations

import asyncio
from datetime import date, datetime
from typing import NoReturn
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app.api.routes.travel_plan import get_analyzer
from app.clients.errors import UpstreamError
from app.core.config import Settings
from app.domain.models import EventCandidate, GeocodedLocation, RouteData
from app.main import app
from app.schemas.travel_plan import (
    Coordinate,
    TravelPlanRequest,
    VisitorReference,
    VisitorStatus,
    WeatherStatus,
)
from app.services.analyzer import TravelPlanAnalyzer

KST = ZoneInfo("Asia/Seoul")
ORIGIN = Coordinate(lat=37.5665, lon=126.978)
DESTINATION = Coordinate(lat=35.1796, lon=129.0756)


class FakeGeocoder:
    async def geocode(self, query: str) -> GeocodedLocation:
        return GeocodedLocation(coordinate=ORIGIN, address=query, candidate_count=1)


class FakeRouter:
    async def directions(self, origin: Coordinate, destination: Coordinate) -> RouteData:
        return RouteData(
            origin=origin,
            destination=DESTINATION,
            distance_meters=400000,
            duration_seconds=18000,
            polyline=[origin, DESTINATION],
        )


class FakeEvents:
    def __init__(self) -> None:
        self.enrich_calls = 0
        self.candidate = EventCandidate(
            content_id="event-1",
            title="샘플 지역 축제",
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 15),
            venue="샘플 행사장",
            address="샘플 주소",
            location=DESTINATION,
            source_url="https://example.com/event",
        )

    async def location_based_list(
        self, coordinate: Coordinate, radius_meters: int, platform: str
    ) -> list[EventCandidate]:
        return [self.candidate]

    async def search_festivals(
        self, start_date: date, end_date: date, platform: str
    ) -> list[EventCandidate]:
        raise UpstreamError("visitkorea", "PROVIDER_ERROR")

    async def enrich(self, candidate: EventCandidate, platform: str) -> EventCandidate:
        self.enrich_calls += 1
        return candidate.model_copy(update={"detail_loaded": True})


class FakeVisitor:
    async def get_reference(
        self, travel_date: date, region_name: str | None, platform: str
    ) -> VisitorReference:
        return VisitorReference(
            status=VisitorStatus.NO_DATA,
            referenceDate=date(2025, 8, 12),
            region=region_name,
            visitorCount=None,
            concentrationRate=None,
            isForecast=False,
            sourceName="한국관광공사 데이터랩",
            note="참고값 없음",
        )


class FailedWeather:
    async def get_forecast(self, coordinate: Coordinate, target_date: date) -> NoReturn:
        raise UpstreamError("weather", "PROVIDER_ERROR")


def make_analyzer() -> TravelPlanAnalyzer:
    settings = Settings(
        _env_file=None,
        data_go_kr_service_key="test-key",
        max_events_per_analysis=10,
        request_timeout_seconds=5,
    )
    return TravelPlanAnalyzer(
        settings,
        FakeGeocoder(),
        FakeRouter(),
        FakeEvents(),
        FakeVisitor(),
        FailedWeather(),
        clock=lambda: datetime(2026, 8, 12, 12, 0, tzinfo=KST),
    )


def test_analyzer_returns_partial_success_and_structured_warnings() -> None:
    analyzer = make_analyzer()
    response = asyncio.run(
        analyzer.analyze(
            TravelPlanRequest.model_validate(
                {
                    "travelDate": "2026-08-12",
                    "origin": ORIGIN.model_dump(),
                    "destination": DESTINATION.model_dump(),
                    "clientPlatform": "AND",
                }
            )
        )
    )

    assert response.events == []
    assert response.nearby_event_count == 1
    assert response.nearby_event_count_is_capped is False
    assert response.congestion.level.value == "low"
    assert analyzer._events.enrich_calls == 0  # type: ignore[attr-defined]
    assert response.weather.status is WeatherStatus.FAILED
    assert {warning.code for warning in response.warnings} == {
        "VISITOR_NO_DATA",
        "WEATHER_FAILED",
    }


def test_analysis_endpoint_returns_request_id_and_does_not_log_input(
    caplog: pytest.LogCaptureFixture,
) -> None:
    analyzer = make_analyzer()
    app.dependency_overrides[get_analyzer] = lambda: analyzer
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/travel-plan/analyze",
                json={
                    "travelDate": "2026-08-12",
                    "origin": "서울역",
                    "destination": "부산 해운대",
                    "clientPlatform": "IOS",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.headers["X-Request-Id"]
    assert response.json()["weather"]["status"] == "failed"
    assert "서울역" not in caplog.text
    assert "test-key" not in caplog.text


def test_invalid_request_and_payload_limit_are_safe_errors() -> None:
    app.dependency_overrides[get_analyzer] = lambda: make_analyzer()
    try:
        with TestClient(app) as client:
            invalid = client.post(
                "/api/v1/travel-plan/analyze",
                json={"travelDate": "invalid"},
            )
            malformed = client.post(
                "/api/v1/travel-plan/analyze",
                content="{",
                headers={"content-type": "application/json"},
            )
            unsupported = client.post(
                "/api/v1/travel-plan/analyze",
                content="{}",
                headers={"content-type": "text/plain"},
            )
            too_large = client.post(
                "/api/v1/travel-plan/analyze",
                content="{}",
                headers={"content-type": "application/json", "content-length": "70000"},
            )
    finally:
        app.dependency_overrides.clear()

    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "input" not in str(invalid.json()).lower()
    assert malformed.status_code == 422
    assert malformed.json()["error"]["code"] == "INVALID_JSON"
    assert unsupported.status_code == 415
    assert unsupported.json()["error"]["code"] == "UNSUPPORTED_MEDIA_TYPE"
    assert too_large.status_code == 413
    assert too_large.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"

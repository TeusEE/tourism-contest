from __future__ import annotations

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from fastapi.testclient import TestClient

from app.api.routes.travel_plan import get_analyzer
from app.clients.http import AsyncJsonClient
from app.clients.naver import NaverMapsClient
from app.clients.visitkorea import VisitKoreaClient
from app.clients.visitor import VisitorClient
from app.clients.weather import WeatherClient
from app.core.config import Settings
from app.main import app
from app.services.analyzer import TravelPlanAnalyzer

FIXTURE_ROOT = Path(__file__).parent / "fixtures"
KST = ZoneInfo("Asia/Seoul")


def _fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURE_ROOT / name).read_text(encoding="utf-8"))


def _destination_event_fixture(name: str) -> dict[str, Any]:
    payload = _fixture(name)
    item = payload["response"]["body"]["items"]["item"]
    if isinstance(item, list):
        item = item[0]
    item["mapx"] = "129.0756"
    item["mapy"] = "35.1796"
    return payload


def test_analysis_endpoint_wires_real_clients_with_mock_transport() -> None:
    settings = Settings(
        _env_file=None,
        data_go_kr_service_key="test-key%2Fvalue%3D",
        ncp_maps_client_id="test-client-id",
        ncp_maps_client_secret="test-client-secret",
        max_events_per_analysis=10,
        request_timeout_seconds=5,
    )

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/map-direction/v1/driving"):
            payload = _fixture("naver/directions_success.json")
        elif path.endswith("locationBasedList2"):
            payload = _destination_event_fixture("visitkorea/location_success.json")
        elif path.endswith("searchFestival2"):
            payload = _fixture("visitkorea/empty.json")
        elif path.endswith("detailCommon2"):
            raise AssertionError("event detail calls must be deferred")
        elif path.endswith("detailIntro2"):
            raise AssertionError("event detail calls must be deferred")
        elif path.endswith("locgoRegnVisitrDDList"):
            payload = _fixture("datalab/visitor_success.json")
        elif path.endswith("tatsCnctrRatedList"):
            payload = _fixture("tatscnctr/success.json")
        elif path.endswith("getVilageFcst"):
            payload = _fixture("weather/short_forecast_success.json")
        else:
            raise AssertionError(f"unexpected mocked provider path: {path}")
        return httpx.Response(200, json=payload, request=request)

    injected = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    transport = AsyncJsonClient(settings, injected)
    analyzer = TravelPlanAnalyzer(
        settings,
        NaverMapsClient(transport, settings),
        NaverMapsClient(transport, settings),
        VisitKoreaClient(transport, settings),
        VisitorClient(transport, settings),
        WeatherClient(transport, settings),
        clock=lambda: datetime(2026, 8, 5, 12, 0, tzinfo=KST),
    )
    app.dependency_overrides[get_analyzer] = lambda: analyzer
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/travel-plan/analyze",
                json={
                    "travelDate": "2026-08-05",
                    "origin": {"lat": 37.5665, "lon": 126.978},
                    "destination": {"lat": 35.1796, "lon": 129.0756},
                    "clientPlatform": "IOS",
                },
            )
    finally:
        app.dependency_overrides.clear()
        asyncio.run(injected.aclose())

    assert response.status_code == 200
    body = response.json()
    assert body["route"]["distanceMeters"] == 400000
    assert body["events"] == []
    assert body["nearbyEventCount"] == 1
    assert body["nearbyEventCountIsCapped"] is False
    assert body["visitorReference"]["visitorCount"] == 12345
    assert body["visitorReference"]["concentrationRate"] == 72.4
    assert body["weather"]["status"] == "no-data"

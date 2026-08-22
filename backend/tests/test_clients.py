from __future__ import annotations

import asyncio
import json
from datetime import date, datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import pytest

from app.clients.errors import (
    UpstreamDecodeError,
    UpstreamHttpError,
    UpstreamTimeoutError,
)
from app.clients.http import AsyncJsonClient
from app.clients.naver import NaverMapsClient
from app.clients.visitkorea import VisitKoreaClient
from app.clients.visitor import VisitorClient, choose_reference_date
from app.clients.weather import WeatherClient, latest_base_time, latlon_to_grid
from app.core.config import Settings
from app.schemas.travel_plan import Coordinate, WeatherStatus

FIXTURE_ROOT = Path(__file__).parent / "fixtures"
KST = ZoneInfo("Asia/Seoul")


def run(coroutine: Any) -> Any:
    return asyncio.run(coroutine)


def settings(**overrides: Any) -> Settings:
    return Settings(
        _env_file=None,
        data_go_kr_service_key="test-key%2Fvalue%3D",
        ncp_maps_client_id="test-client-id",
        ncp_maps_client_secret="test-client-secret",
        **overrides,
    )


def fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURE_ROOT / name).read_text(encoding="utf-8"))


def test_async_json_client_retries_5xx_and_rejects_invalid_json() -> None:
    attempts = 0

    def retry_handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(500, request=request)
        return httpx.Response(200, json={"ok": True}, request=request)

    transport = httpx.MockTransport(retry_handler)
    injected = httpx.AsyncClient(transport=transport)
    client = AsyncJsonClient(settings(), injected)
    payload = run(client.get_json("sample", "https://example.com/data"))

    assert payload == {"ok": True}
    assert attempts == 2

    invalid = AsyncJsonClient(
        settings(),
        httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(200, content=b"not-json", request=request)
            )
        ),
    )
    with pytest.raises(UpstreamDecodeError):
        run(invalid.get_json("sample", "https://example.com/data"))


def test_async_json_client_maps_4xx_timeout_and_bounds_concurrency() -> None:
    bad = AsyncJsonClient(
        settings(),
        httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(400, request=request)
            )
        ),
    )
    with pytest.raises(UpstreamHttpError) as http_error:
        run(bad.get_json("sample", "https://example.com/data"))
    assert http_error.value.status_code == 400

    timeout_attempts = 0

    def timeout_handler(request: httpx.Request) -> httpx.Response:
        nonlocal timeout_attempts
        timeout_attempts += 1
        raise httpx.ReadTimeout("timed out", request=request)

    timed_out = AsyncJsonClient(
        settings(), httpx.AsyncClient(transport=httpx.MockTransport(timeout_handler))
    )
    with pytest.raises(UpstreamTimeoutError):
        run(timed_out.get_json("sample", "https://example.com/data"))
    assert timeout_attempts == 2

    active = 0
    peak = 0

    async def bounded_handler(request: httpx.Request) -> httpx.Response:
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.01)
        active -= 1
        return httpx.Response(200, json={"ok": True}, request=request)

    bounded_settings = settings(max_concurrent_upstream_requests=2)
    bounded = AsyncJsonClient(
        bounded_settings,
        httpx.AsyncClient(transport=httpx.MockTransport(bounded_handler)),
    )

    async def request_all() -> list[dict[str, Any]]:
        return await asyncio.gather(
            *(bounded.get_json("sample", "https://example.com/data") for _ in range(5))
        )

    assert run(request_all()) == [{"ok": True}] * 5
    assert peak <= 2


def test_naver_clients_map_fixture_fields_and_headers() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["X-NCP-APIGW-API-KEY-ID"] == "test-client-id"
        assert request.headers["X-NCP-APIGW-API-KEY"] == "test-client-secret"
        if request.url.path.endswith("geocode"):
            return httpx.Response(200, json=fixture("naver/geocode_success.json"), request=request)
        return httpx.Response(
            200,
            json=fixture("naver/directions_success.json"),
            request=request,
        )

    injected = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = NaverMapsClient(AsyncJsonClient(settings(), injected), settings())
    origin = Coordinate(lat=37.5665, lon=126.978)
    destination = Coordinate(lat=35.1796, lon=129.0756)

    geocoded = run(client.geocode("서울역"))
    route = run(client.directions(origin, destination))

    assert geocoded.coordinate == Coordinate(lat=37.5665, lon=126.978)
    assert geocoded.candidate_count == 1
    assert route.distance_meters == 400000
    assert route.duration_seconds == 18000
    assert route.polyline[0] == origin
    assert route.polyline[-1] == destination


def test_naver_local_search_parses_candidates_and_resolves_place_names() -> None:
    paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        assert request.headers["X-NCP-APIGW-API-KEY-ID"] == "test-client-id"
        assert request.headers["X-NCP-APIGW-API-KEY"] == "test-client-secret"
        if request.url.path.endswith("geocode"):
            return httpx.Response(200, json={"status": "OK", "addresses": []}, request=request)
        assert request.url.path.endswith("/search/v1/local")
        assert request.url.params["query"] == "서울역"
        assert request.url.params["display"] in {"2", "5"}
        return httpx.Response(
            200,
            json=fixture("naver/local_search_success.json"),
            request=request,
        )

    current_settings = settings()
    injected = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = NaverMapsClient(AsyncJsonClient(current_settings, injected), current_settings)

    suggestions = run(client.local_search("서울역", limit=2))
    resolved = run(client.geocode("서울역"))

    assert suggestions[0].name == "서울역"
    assert suggestions[0].road_address == "서울특별시 중구 한강대로 405"
    assert suggestions[0].coordinate == Coordinate(lat=37.554678, lon=126.970606)
    assert resolved.address == "서울특별시 중구 한강대로 405"
    assert resolved.coordinate == suggestions[0].coordinate
    assert resolved.candidate_count == 2
    assert paths == ["/search/v1/local", "/map-geocode/v2/geocode", "/search/v1/local"]


def test_naver_local_search_parses_scaled_integer_coordinates() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "items": [
                    {
                        "title": "<b>서울역</b> (고속철도)",
                        "address": "서울특별시 용산구 동자동 43-205",
                        "roadAddress": "서울특별시 용산구 한강대로 405",
                        "mapx": "1269707021",
                        "mapy": "375540730",
                    }
                ]
            },
            request=request,
        )

    current_settings = settings()
    injected = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = NaverMapsClient(AsyncJsonClient(current_settings, injected), current_settings)

    candidates = run(client.local_search("서울역", limit=1))

    assert candidates[0].coordinate == Coordinate(lat=37.554073, lon=126.9707021)


def test_naver_local_search_uses_dedicated_api_hub_credentials() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["X-NCP-APIGW-API-KEY-ID"] == "local-search-client-id"
        assert request.headers["X-NCP-APIGW-API-KEY"] == "local-search-client-secret"
        return httpx.Response(200, json={"items": []}, request=request)

    current_settings = settings(
        ncp_local_search_client_id="local-search-client-id",
        ncp_local_search_client_secret="local-search-client-secret",
    )
    injected = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = NaverMapsClient(AsyncJsonClient(current_settings, injected), current_settings)

    assert run(client.local_search("서울역")) == []


def test_visitkorea_and_visitor_clients_parse_sanitized_fixtures() -> None:
    platforms: set[str] = set()

    def handler(request: httpx.Request) -> httpx.Response:
        platforms.add(request.url.params["MobileOS"])
        assert request.url.params["serviceKey"] == "test-key/value="
        if request.url.path.endswith("locationBasedList2"):
            payload = fixture("visitkorea/location_success.json")
        elif request.url.path.endswith("detailCommon2"):
            payload = fixture("visitkorea/detail_common_success.json")
        elif request.url.path.endswith("detailIntro2"):
            payload = fixture("visitkorea/detail_intro_success.json")
        elif request.url.path.endswith("locgoRegnVisitrDDList"):
            payload = fixture("datalab/visitor_success.json")
        else:
            payload = fixture("tatscnctr/success.json")
        return httpx.Response(200, json=payload, request=request)

    current_settings = settings()
    injected = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    transport = AsyncJsonClient(current_settings, injected)
    events = VisitKoreaClient(transport, current_settings)
    visitors = VisitorClient(transport, current_settings)

    candidates = run(
        events.location_based_list(
            Coordinate(lat=37.5665, lon=126.978),
            10000,
            "IOS",
        )
    )
    run(events.location_based_list(Coordinate(lat=37.5665, lon=126.978), 10000, "AND"))
    enriched = run(events.enrich(candidates[0], "AND"))
    reference = run(visitors.get_reference(date(2026, 10, 3), "샘플구", "IOS"))

    assert candidates[0].content_id == "sample-event-1001"
    assert candidates[0].location == Coordinate(lat=37.5665, lon=126.978)
    assert enriched.detail_loaded is True
    assert enriched.venue == "샘플 행사장"
    assert enriched.end_date == date(2026, 8, 10)
    assert reference.visitor_count == 12345
    assert reference.concentration_rate == 72.4
    assert reference.reference_date == date(2026, 7, 1)
    assert reference.is_forecast is False
    assert platforms == {"IOS", "AND"}


def test_weather_client_converts_grid_and_handles_unpublished_dates() -> None:
    now = datetime(2026, 8, 12, 12, 0, tzinfo=KST)
    assert latlon_to_grid(Coordinate(lat=37.5665, lon=126.978)) == (60, 127)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["nx"] == "60"
        assert request.url.params["ny"] == "127"
        return httpx.Response(
            200,
            json=fixture("weather/short_forecast_success.json"),
            request=request,
        )

    current_settings = settings()
    injected = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = WeatherClient(AsyncJsonClient(current_settings, injected), current_settings)
    available = run(
        client.get_forecast(Coordinate(lat=37.5665, lon=126.978), date(2026, 8, 12), now=now)
    )
    unpublished = run(
        client.get_forecast(Coordinate(lat=37.5665, lon=126.978), date(2026, 8, 20), now=now)
    )

    assert available.status is WeatherStatus.AVAILABLE
    assert len(available.forecasts) == 1
    assert unpublished.status is WeatherStatus.NOT_YET_PUBLISHED


def test_latest_base_time_handles_midnight_before_same_day_releases() -> None:
    assert latest_base_time(datetime(2026, 8, 20, 0, 3, tzinfo=KST)) == (
        date(2026, 8, 19),
        "2300",
    )
    assert latest_base_time(datetime(2026, 8, 20, 2, 9, tzinfo=KST)) == (
        date(2026, 8, 19),
        "2300",
    )
    assert latest_base_time(datetime(2026, 8, 20, 2, 10, tzinfo=KST)) == (
        date(2026, 8, 20),
        "0200",
    )


def test_reference_date_uses_previous_year_for_future_travel() -> None:
    now = datetime(2026, 8, 12, 12, 0, tzinfo=KST)
    assert choose_reference_date(date(2026, 10, 3), now=now) == date(2025, 10, 3)

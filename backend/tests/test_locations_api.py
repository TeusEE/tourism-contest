from __future__ import annotations

from typing import NoReturn

from fastapi.testclient import TestClient

from app.api.routes.locations import get_location_searcher
from app.clients.errors import UpstreamError
from app.domain.models import LocationCandidate
from app.main import app
from app.schemas.travel_plan import Coordinate


class FakeLocationSearcher:
    async def local_search(self, query: str, *, limit: int = 5) -> list[LocationCandidate]:
        return [
            LocationCandidate(
                name=query,
                address="서울특별시 중구 봉래동2가 122-11",
                road_address="서울특별시 중구 한강대로 405",
                coordinate=Coordinate(lat=37.554678, lon=126.970606),
            )
        ][:limit]


class FailedLocationSearcher:
    async def local_search(self, query: str, *, limit: int = 5) -> NoReturn:
        raise UpstreamError("naver-local-search", "HTTP_ERROR")


def test_location_suggestions_return_address_and_coordinate() -> None:
    app.dependency_overrides[get_location_searcher] = lambda: FakeLocationSearcher()
    try:
        with TestClient(app) as client:
            response = client.get(
                "/api/v1/locations/suggestions",
                params={"q": "서울역", "limit": 3},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {
                "name": "서울역",
                "address": "서울특별시 중구 봉래동2가 122-11",
                "roadAddress": "서울특별시 중구 한강대로 405",
                "location": {"lat": 37.554678, "lon": 126.970606},
            }
        ]
    }


def test_location_suggestions_map_provider_failure_to_safe_error() -> None:
    app.dependency_overrides[get_location_searcher] = lambda: FailedLocationSearcher()
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/locations/suggestions", params={"q": "서울역"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "LOCATION_SUGGESTIONS_UNAVAILABLE"
    assert "서울역" not in response.text


def test_location_suggestions_reject_short_queries() -> None:
    app.dependency_overrides[get_location_searcher] = lambda: FakeLocationSearcher()
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/locations/suggestions", params={"q": " "})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"

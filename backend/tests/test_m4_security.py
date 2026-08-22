from __future__ import annotations

import asyncio
import logging

from fastapi.testclient import TestClient
from starlette.requests import Request

from app.api.routes.travel_plan import get_analyzer
from app.core.middleware import _cache_body_with_limit
from app.main import app
from app.services.analyzer import TravelPlanAnalyzer


class ExplodingAnalyzer:
    async def analyze(self, request: object) -> TravelPlanAnalyzer:
        raise RuntimeError("private upstream credential must not be returned")


def test_public_openapi_contains_only_supported_paths_and_methods() -> None:
    with TestClient(app) as client:
        response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert set(paths) == {
        "/health",
        "/api/v1/locations/suggestions",
        "/api/v1/travel-plan/analyze",
    }
    assert set(paths["/health"]) == {"get"}
    assert set(paths["/api/v1/locations/suggestions"]) == {"get"}
    assert set(paths["/api/v1/travel-plan/analyze"]) == {"post"}


def test_arbitrary_url_proxy_and_unlisted_methods_are_not_available() -> None:
    with TestClient(app) as client:
        proxy = client.get("/proxy", params={"url": "https://example.com"})
        options = client.options("/api/v1/travel-plan/analyze")
        cross_origin = client.get("/health", headers={"Origin": "https://example.com"})

    assert proxy.status_code == 404
    assert options.status_code == 405
    assert "access-control-allow-origin" not in cross_origin.headers


def test_streaming_request_body_is_rejected_without_content_length() -> None:
    messages = iter(
        [
            {"type": "http.request", "body": b"1234", "more_body": True},
            {"type": "http.request", "body": b"56", "more_body": False},
        ]
    )

    async def receive() -> dict[str, object]:
        return next(messages)

    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/travel-plan/analyze",
            "raw_path": b"/api/v1/travel-plan/analyze",
            "query_string": b"",
            "headers": [],
            "scheme": "http",
            "server": ("testserver", 80),
            "client": ("testclient", 123),
            "root_path": "",
            "http_version": "1.1",
        },
        receive,
    )

    assert asyncio.run(_cache_body_with_limit(request, 5)) is False


def test_internal_exception_response_does_not_expose_exception_text(
    caplog,
) -> None:
    app.dependency_overrides[get_analyzer] = lambda: ExplodingAnalyzer()  # type: ignore[assignment]
    try:
        with caplog.at_level(logging.ERROR):
            with TestClient(app, raise_server_exceptions=False) as client:
                response = client.post(
                    "/api/v1/travel-plan/analyze",
                    json={
                        "travelDate": "2026-08-12",
                        "origin": "서울역",
                        "destination": "부산역",
                        "clientPlatform": "AND",
                    },
                )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
    assert "private upstream credential" not in response.text
    assert "private upstream credential" not in caplog.text

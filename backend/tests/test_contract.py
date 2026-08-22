from datetime import datetime

from app.schemas.travel_plan import (
    ClientPlatform,
    CongestionLevel,
    SourceType,
    TravelPlanAnalysisResponse,
    TravelPlanRequest,
    WeatherStatus,
)


def test_request_accepts_prd_camel_case_fields() -> None:
    request = TravelPlanRequest.model_validate(
        {
            "travelDate": "2026-10-03",
            "origin": "서울역",
            "destination": "부산 해운대",
            "clientPlatform": "IOS",
            "eventKeywords": ["축제", "공연"],
        }
    )

    assert request.client_platform is ClientPlatform.IOS
    assert request.model_dump(by_alias=True)["travelDate"].isoformat() == "2026-10-03"


def test_request_accepts_coordinate_location_input() -> None:
    request = TravelPlanRequest.model_validate(
        {
            "travelDate": "2026-10-03",
            "origin": {"lat": 37.554678, "lon": 126.970606},
            "destination": {"lat": 35.158698, "lon": 129.160384},
            "clientPlatform": "AND",
        }
    )

    assert request.origin.lat == 37.554678  # type: ignore[union-attr]
    assert request.destination.lon == 129.160384  # type: ignore[union-attr]


def test_response_example_validates_with_shared_enums() -> None:
    response = TravelPlanAnalysisResponse.model_validate(
        {
            "travelDate": "2026-10-03",
            "route": {
                "origin": {"lat": 37.554678, "lon": 126.970606},
                "destination": {"lat": 35.158698, "lon": 129.160384},
                "distanceMeters": 400000,
                "durationSeconds": 18000,
                "polyline": [],
            },
            "congestion": {
                "level": "high",
                "summary": "여행일의 목적지 주변 혼잡 가능성이 높습니다.",
                "reasons": ["공식 축제 기간과 여행일이 겹칩니다."],
                "isTrafficPrediction": False,
            },
            "events": [
                {
                    "id": "event-1",
                    "title": "지역 축제",
                    "startDate": "2026-10-01",
                    "endDate": "2026-10-10",
                    "venue": "축제 장소",
                    "address": "부산광역시 해운대구 예시로 1",
                    "location": {"lat": 35.1632, "lon": 129.1636},
                    "eventType": "festival",
                    "keywords": ["축제", "공연"],
                    "sourceType": "visitkorea",
                    "sourceUrl": "https://example.com/event",
                    "sourceName": "한국관광공사",
                    "confidence": "high",
                    "status": "confirmed",
                    "distanceToRouteMeters": 4800,
                    "distanceToDestinationMeters": 4800,
                    "checkedAt": "2026-08-12T12:00:00+09:00",
                    "congestionSignal": "high",
                }
            ],
            "nearbyEventCount": 6,
            "nearbyEventCountIsCapped": False,
            "visitorReference": {
                "status": "available",
                "referenceDate": "2025-10-03",
                "region": "부산광역시 해운대구",
                "visitorCount": 32145,
                "concentrationRate": None,
                "isForecast": False,
                "sourceName": "한국관광공사",
                "note": "과거 참고값이며 여행일의 미래 방문객 수 예측이 아닙니다.",
            },
            "weather": {
                "status": "not-yet-published",
                "targetDate": "2026-10-03",
                "summary": None,
                "forecasts": [],
                "note": "여행일의 단기예보가 아직 발표되지 않았습니다.",
                "checkedAt": "2026-08-12T12:00:00+09:00",
            },
            "warnings": [
                {
                    "code": "WEATHER_NOT_YET_PUBLISHED",
                    "scope": "weather",
                    "severity": "info",
                    "message": "여행일의 단기예보가 아직 발표되지 않았습니다.",
                    "eventId": None,
                }
            ],
            "generatedAt": datetime.fromisoformat("2026-08-12T12:00:00+09:00"),
        }
    )

    assert response.congestion.level is CongestionLevel.HIGH
    assert response.events[0].source_type is SourceType.VISITKOREA
    assert response.weather.status is WeatherStatus.NOT_YET_PUBLISHED

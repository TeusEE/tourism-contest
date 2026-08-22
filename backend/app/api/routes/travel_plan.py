from __future__ import annotations

from typing import cast

from fastapi import APIRouter, Body, Depends, Request

from app.schemas.travel_plan import TravelPlanAnalysisResponse, TravelPlanRequest
from app.services.analyzer import TravelPlanAnalyzer

router = APIRouter(prefix="/api/v1/travel-plan", tags=["travel-plan"])


def get_analyzer(request: Request) -> TravelPlanAnalyzer:
    return cast(TravelPlanAnalyzer, request.app.state.analyzer)


_ANALYSIS_BODY = Body(
    ...,
    openapi_examples={
        "address-input": {
            "summary": "주소 기반 요청",
            "value": {
                "travelDate": "2026-10-03",
                "origin": "서울역",
                "destination": "부산 해운대",
                "departureTime": "08:00",
                "clientPlatform": "IOS",
                "eventKeywords": ["축제", "공연"],
            },
        },
        "coordinate-input": {
            "summary": "좌표 기반 요청",
            "value": {
                "travelDate": "2026-10-03",
                "origin": {"lat": 37.554678, "lon": 126.970606},
                "destination": {"lat": 35.158698, "lon": 129.160384},
                "clientPlatform": "AND",
            },
        },
    },
)
_ANALYZER_DEPENDENCY = Depends(get_analyzer)


@router.post(
    "/analyze",
    response_model=TravelPlanAnalysisResponse,
    response_model_by_alias=True,
    summary="여행계획 주변 혼잡 가능성 분석",
)
async def analyze_travel_plan(
    request: TravelPlanRequest = _ANALYSIS_BODY,
    analyzer: TravelPlanAnalyzer = _ANALYZER_DEPENDENCY,
) -> TravelPlanAnalysisResponse:
    return await analyzer.analyze(request)

from __future__ import annotations

from typing import Protocol, cast

from fastapi import APIRouter, Depends, Query, Request

from app.api.errors import AnalysisError
from app.clients.errors import UpstreamError
from app.domain.models import LocationCandidate
from app.schemas.locations import LocationSuggestion, LocationSuggestionResponse

router = APIRouter(prefix="/api/v1/locations", tags=["locations"])


class LocationSearcher(Protocol):
    async def local_search(self, query: str, *, limit: int = 5) -> list[LocationCandidate]: ...


def get_location_searcher(request: Request) -> LocationSearcher:
    return cast(LocationSearcher, request.app.state.location_searcher)


_SEARCHER_DEPENDENCY = Depends(get_location_searcher)


@router.get(
    "/suggestions",
    response_model=LocationSuggestionResponse,
    response_model_by_alias=True,
    summary="장소명 주소 후보 검색",
)
async def suggest_locations(
    q: str = Query(min_length=1, max_length=200, description="장소명 또는 주소 검색어"),
    limit: int = Query(default=5, ge=1, le=5),
    searcher: LocationSearcher = _SEARCHER_DEPENDENCY,
) -> LocationSuggestionResponse:
    query = q.strip()
    if len(query) < 2:
        raise AnalysisError(
            "VALIDATION_ERROR",
            "장소 검색어는 2자 이상 입력해 주세요.",
            422,
        )
    try:
        candidates = await searcher.local_search(query, limit=limit)
    except UpstreamError as exc:
        raise AnalysisError(
            "LOCATION_SUGGESTIONS_UNAVAILABLE",
            "장소 추천을 불러오지 못했습니다.",
            503,
        ) from exc

    return LocationSuggestionResponse(
        items=[
            LocationSuggestion(
                name=candidate.name,
                address=candidate.address,
                roadAddress=candidate.road_address,
                location=candidate.coordinate,
            )
            for candidate in candidates
        ]
    )

from __future__ import annotations

from pydantic import Field

from app.schemas.travel_plan import ContractModel, Coordinate


class LocationSuggestion(ContractModel):
    name: str
    address: str | None = None
    road_address: str | None = Field(default=None, alias="roadAddress")
    location: Coordinate


class LocationSuggestionResponse(ContractModel):
    items: list[LocationSuggestion]

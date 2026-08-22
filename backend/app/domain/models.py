from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.travel_plan import (
    Coordinate,
    EventConfidence,
    EventStatus,
    EventType,
    SourceType,
)


class DomainModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class GeocodedLocation(DomainModel):
    coordinate: Coordinate
    address: str | None = None
    candidate_count: int = Field(ge=1)


class LocationCandidate(DomainModel):
    name: str
    address: str | None = None
    road_address: str | None = None
    coordinate: Coordinate


class RouteData(DomainModel):
    origin: Coordinate
    destination: Coordinate
    distance_meters: int = Field(ge=0)
    duration_seconds: int = Field(ge=0)
    polyline: list[Coordinate]


class EventCandidate(DomainModel):
    content_id: str
    title: str
    start_date: date | None = None
    end_date: date | None = None
    venue: str | None = None
    address: str | None = None
    location: Coordinate | None = None
    event_type: EventType = EventType.FESTIVAL
    keywords: list[str] = Field(default_factory=list)
    content_type_id: str = "15"
    source_type: SourceType = SourceType.VISITKOREA
    source_url: str | None = None
    source_name: str = "한국관광공사"
    confidence: EventConfidence = EventConfidence.LOW
    status: EventStatus = EventStatus.CANDIDATE
    detail_loaded: bool = False
    checked_at: datetime | None = None

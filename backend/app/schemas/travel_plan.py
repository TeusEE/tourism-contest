from __future__ import annotations

from datetime import date, datetime, time
from enum import StrEnum
from typing import Annotated, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class ClientPlatform(StrEnum):
    IOS = "IOS"
    AND = "AND"


class CongestionLevel(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    NEEDS_CONFIRMATION = "needs-confirmation"


class EventConfidence(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class EventStatus(StrEnum):
    CONFIRMED = "confirmed"
    CANDIDATE = "candidate"
    CHANGED = "changed"
    CANCELLED = "cancelled"


class EventType(StrEnum):
    FESTIVAL = "festival"
    PERFORMANCE = "performance"
    SPORTS = "sports"
    OTHER = "other"


class SourceType(StrEnum):
    VISITKOREA = "visitkorea"
    LOCAL_GOV = "local-gov"
    ORGANIZER = "organizer"


class VisitorStatus(StrEnum):
    AVAILABLE = "available"
    NO_DATA = "no-data"
    FAILED = "failed"


class WeatherStatus(StrEnum):
    AVAILABLE = "available"
    NOT_YET_PUBLISHED = "not-yet-published"
    NO_DATA = "no-data"
    FAILED = "failed"


class WeatherCondition(StrEnum):
    CLEAR = "clear"
    PARTLY_CLOUDY = "partly-cloudy"
    CLOUDY = "cloudy"
    RAIN = "rain"
    SNOW = "snow"
    RAIN_SNOW = "rain-snow"
    UNKNOWN = "unknown"


class WarningScope(StrEnum):
    ANALYSIS = "analysis"
    EVENTS = "events"
    VISITOR = "visitor"
    WEATHER = "weather"


class WarningSeverity(StrEnum):
    INFO = "info"
    WARNING = "warning"


class Coordinate(ContractModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


LocationInput: TypeAlias = Annotated[str, Field(min_length=1, max_length=200)] | Coordinate


class TravelPlanRequest(ContractModel):
    travel_date: date = Field(alias="travelDate")
    origin: LocationInput
    destination: LocationInput
    departure_time: time | None = Field(default=None, alias="departureTime")
    client_platform: ClientPlatform = Field(alias="clientPlatform")
    # Kept for request compatibility; destination-only event search does not use it.
    route_buffer_meters: int = Field(default=10_000, ge=1, le=20_000, alias="routeBufferMeters")
    destination_radius_meters: int = Field(
        default=15_000,
        ge=1,
        le=20_000,
        alias="destinationRadiusMeters",
    )
    event_keywords: list[str] = Field(default_factory=list, max_length=10, alias="eventKeywords")

    @field_validator("origin", "destination", mode="before")
    @classmethod
    def normalize_address(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("event_keywords")
    @classmethod
    def normalize_keywords(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            keyword = value.strip()
            if not 1 <= len(keyword) <= 40:
                raise ValueError("eventKeywords items must be 1 to 40 characters")
            if keyword not in normalized:
                normalized.append(keyword)
        return normalized


class RouteSummary(ContractModel):
    origin: Coordinate
    destination: Coordinate
    distance_meters: int = Field(alias="distanceMeters", ge=0)
    duration_seconds: int = Field(alias="durationSeconds", ge=0)
    polyline: list[Coordinate]


class CongestionSummary(ContractModel):
    level: CongestionLevel
    summary: str
    reasons: list[str]
    is_traffic_prediction: Literal[False] = Field(default=False, alias="isTrafficPrediction")


class EventSummary(ContractModel):
    id: str
    title: str
    start_date: date = Field(alias="startDate")
    end_date: date = Field(alias="endDate")
    venue: str | None = None
    address: str | None = None
    location: Coordinate | None = None
    event_type: EventType = Field(alias="eventType")
    keywords: list[str] = Field(default_factory=list)
    source_type: SourceType = Field(alias="sourceType")
    source_url: str | None = Field(default=None, alias="sourceUrl")
    source_name: str = Field(alias="sourceName")
    confidence: EventConfidence
    status: EventStatus
    distance_to_route_meters: int | None = Field(default=None, alias="distanceToRouteMeters", ge=0)
    distance_to_destination_meters: int | None = Field(
        default=None,
        alias="distanceToDestinationMeters",
        ge=0,
    )
    checked_at: datetime = Field(alias="checkedAt")
    congestion_signal: CongestionLevel = Field(alias="congestionSignal")


class VisitorReference(ContractModel):
    status: VisitorStatus
    reference_date: date | None = Field(default=None, alias="referenceDate")
    region: str | None = None
    visitor_count: int | None = Field(default=None, alias="visitorCount", ge=0)
    concentration_rate: float | None = Field(
        default=None,
        ge=0,
        le=100,
        alias="concentrationRate",
    )
    is_forecast: Literal[False] = Field(default=False, alias="isForecast")
    source_name: str = Field(alias="sourceName")
    note: str


class WeatherForecast(ContractModel):
    forecast_at: datetime = Field(alias="forecastAt")
    condition: WeatherCondition
    temperature_c: float | None = Field(default=None, alias="temperatureC")
    precipitation_probability_percent: float | None = Field(
        default=None,
        alias="precipitationProbabilityPercent",
        ge=0,
        le=100,
    )
    precipitation_mm: float | None = Field(default=None, alias="precipitationMm", ge=0)


class WeatherSummary(ContractModel):
    status: WeatherStatus
    target_date: date = Field(alias="targetDate")
    summary: str | None = None
    forecasts: list[WeatherForecast]
    note: str | None = None
    checked_at: datetime = Field(alias="checkedAt")


class Warning(ContractModel):
    code: str
    scope: WarningScope
    severity: WarningSeverity
    message: str
    event_id: str | None = Field(default=None, alias="eventId")


class TravelPlanAnalysisResponse(ContractModel):
    travel_date: date = Field(alias="travelDate")
    route: RouteSummary
    congestion: CongestionSummary
    events: list[EventSummary]
    nearby_event_count: int | None = Field(default=None, alias="nearbyEventCount", ge=0)
    nearby_event_count_is_capped: bool = Field(
        default=False,
        alias="nearbyEventCountIsCapped",
    )
    visitor_reference: VisitorReference | None = Field(default=None, alias="visitorReference")
    weather: WeatherSummary
    warnings: list[Warning]
    generated_at: datetime = Field(alias="generatedAt")

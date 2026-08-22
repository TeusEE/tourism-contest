from __future__ import annotations

from datetime import date, datetime
from difflib import SequenceMatcher

from app.domain.geometry import distance_between_points_meters, distance_to_route_meters
from app.domain.models import EventCandidate
from app.schemas.travel_plan import (
    CongestionLevel,
    Coordinate,
    EventConfidence,
    EventStatus,
    EventSummary,
)


def deduplicate_candidates(candidates: list[EventCandidate]) -> list[EventCandidate]:
    unique: list[EventCandidate] = []
    by_content_id: dict[str, int] = {}
    by_url: dict[str, int] = {}
    for candidate in candidates:
        existing_index = by_content_id.get(candidate.content_id)
        if existing_index is None and candidate.source_url:
            existing_index = by_url.get(candidate.source_url)
        if existing_index is None:
            existing_index = _find_similar_candidate(unique, candidate)
        if existing_index is None:
            unique.append(candidate)
            index = len(unique) - 1
        else:
            unique[existing_index] = _merge_candidates(unique[existing_index], candidate)
            index = existing_index
        by_content_id[candidate.content_id] = index
        if candidate.source_url:
            by_url[candidate.source_url] = index
    return unique


def normalize_candidates(
    candidates: list[EventCandidate],
    travel_date: date,
    route_points: list[Coordinate],
    destination: Coordinate,
    route_buffer_meters: int,
    destination_radius_meters: int,
    event_keywords: list[str],
    checked_at: datetime,
) -> list[EventSummary]:
    normalized: list[EventSummary] = []
    keyword_values = [keyword.strip().lower() for keyword in event_keywords if keyword.strip()]
    for candidate in deduplicate_candidates(candidates):
        if candidate.status is EventStatus.CANCELLED:
            continue
        if not _matches_keywords(candidate, keyword_values):
            continue
        if candidate.start_date is None:
            continue
        end_date = candidate.end_date or candidate.start_date
        if end_date < candidate.start_date or not (
            candidate.start_date <= travel_date <= end_date
        ):
            continue

        distance_to_route = (
            distance_to_route_meters(candidate.location, route_points)
            if candidate.location is not None and route_points
            else None
        )
        distance_to_destination = (
            distance_between_points_meters(candidate.location, destination)
            if candidate.location is not None
            else None
        )
        if route_points:
            is_in_scope = candidate.location is None or (
                (distance_to_route is not None and distance_to_route <= route_buffer_meters)
                or (
                    distance_to_destination is not None
                    and distance_to_destination <= destination_radius_meters
                )
            )
        else:
            is_in_scope = candidate.location is None or (
                distance_to_destination is not None
                and distance_to_destination <= destination_radius_meters
            )
        if not is_in_scope:
            continue

        confidence = _confidence(candidate, end_date)
        status = (
            EventStatus.CONFIRMED
            if candidate.source_url and confidence is EventConfidence.HIGH
            else candidate.status
        )
        normalized.append(
            EventSummary(
                id=candidate.content_id,
                title=candidate.title,
                startDate=candidate.start_date,
                endDate=end_date,
                venue=candidate.venue,
                address=candidate.address,
                location=candidate.location,
                eventType=candidate.event_type,
                keywords=candidate.keywords,
                sourceType=candidate.source_type,
                sourceUrl=candidate.source_url,
                sourceName=candidate.source_name,
                confidence=confidence,
                status=status,
                distanceToRouteMeters=distance_to_route,
                distanceToDestinationMeters=distance_to_destination,
                checkedAt=checked_at,
                congestionSignal=CongestionLevel.NEEDS_CONFIRMATION,
            )
        )
    return normalized


def _matches_keywords(candidate: EventCandidate, keywords: list[str]) -> bool:
    if not keywords:
        return True
    searchable = " ".join(
        value.lower()
        for value in (candidate.title, candidate.venue, candidate.address)
        if value
    )
    return any(keyword in searchable for keyword in keywords)


def _confidence(candidate: EventCandidate, end_date: date) -> EventConfidence:
    if candidate.start_date and candidate.location and candidate.source_url and end_date:
        return EventConfidence.HIGH
    if candidate.start_date and (candidate.location or candidate.source_url):
        return EventConfidence.MEDIUM
    return EventConfidence.LOW


def _find_similar_candidate(
    candidates: list[EventCandidate], candidate: EventCandidate
) -> int | None:
    candidate_title = _normalize_title(candidate.title)
    for index, existing in enumerate(candidates):
        if not _dates_overlap(existing, candidate):
            continue
        existing_title = _normalize_title(existing.title)
        title_similarity = SequenceMatcher(None, existing_title, candidate_title).ratio()
        if title_similarity < 0.92:
            continue
        if existing.venue and candidate.venue:
            if _normalize_title(existing.venue) == _normalize_title(candidate.venue):
                return index
        if existing.location and candidate.location:
            if distance_between_points_meters(existing.location, candidate.location) <= 1_000:
                return index
    return None


def _merge_candidates(first: EventCandidate, second: EventCandidate) -> EventCandidate:
    values = first.model_dump()
    for field in (
        "title",
        "start_date",
        "end_date",
        "venue",
        "address",
        "location",
        "source_url",
    ):
        if not values.get(field) and getattr(second, field):
            values[field] = getattr(second, field)
    values["detail_loaded"] = first.detail_loaded or second.detail_loaded
    return EventCandidate(**values)


def _dates_overlap(first: EventCandidate, second: EventCandidate) -> bool:
    if first.start_date is None or second.start_date is None:
        return False
    first_end = first.end_date or first.start_date
    second_end = second.end_date or second.start_date
    return first.start_date <= second_end and second.start_date <= first_end


def _normalize_title(value: str) -> str:
    return "".join(value.lower().split())

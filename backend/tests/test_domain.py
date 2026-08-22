from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from app.clients.weather import latlon_to_grid
from app.domain.congestion import (
    apply_congestion_signals,
    build_congestion_summary,
    build_event_density_summary,
)
from app.domain.events import deduplicate_candidates, normalize_candidates
from app.domain.geometry import (
    distance_between_points_meters,
    distance_to_route_meters,
    generate_search_points,
)
from app.domain.models import EventCandidate, RouteData
from app.schemas.travel_plan import (
    CongestionLevel,
    Coordinate,
    EventStatus,
)

KST = ZoneInfo("Asia/Seoul")
CHECKED_AT = datetime(2026, 8, 12, 12, 0, tzinfo=KST)
ORIGIN = Coordinate(lat=37.5665, lon=126.978)
DESTINATION = Coordinate(lat=35.1796, lon=129.0756)


def route() -> RouteData:
    return RouteData(
        origin=ORIGIN,
        destination=DESTINATION,
        distance_meters=400000,
        duration_seconds=18000,
        polyline=[ORIGIN, DESTINATION],
    )


def candidate(
    content_id: str,
    *,
    title: str = "지역 축제",
    location: Coordinate | None = ORIGIN,
) -> EventCandidate:
    return EventCandidate(
        content_id=content_id,
        title=title,
        start_date=date(2026, 8, 10),
        end_date=date(2026, 8, 15),
        venue="행사장",
        address="행사 주소",
        location=location,
        source_url="https://example.com/event",
    )


def test_search_points_are_bounded_and_route_distance_uses_wgs84_order() -> None:
    points = generate_search_points(route(), 5)
    assert 1 <= len(points) <= 5
    assert points[-1] == DESTINATION
    assert distance_to_route_meters(ORIGIN, route().polyline) == 0
    assert 300_000 < distance_between_points_meters(ORIGIN, DESTINATION) < 350_000
    assert latlon_to_grid(ORIGIN) == (60, 127)
    assert generate_search_points(route(), 1) == [DESTINATION]


def test_event_dates_and_duplicate_content_are_normalized() -> None:
    duplicates = [
        candidate("one"),
        candidate("one"),
        candidate("two", title="다른 행사").model_copy(
            update={"source_url": "https://example.com/other"}
        ),
    ]
    assert len(deduplicate_candidates(duplicates)) == 2

    events = normalize_candidates(
        duplicates,
        date(2026, 8, 12),
        route().polyline,
        DESTINATION,
        10000,
        10000,
        [],
        CHECKED_AT,
    )
    assert len(events) == 2
    assert all(event.start_date <= date(2026, 8, 12) <= event.end_date for event in events)

    outside = normalize_candidates(
        [
            EventCandidate(
                content_id="outside",
                title="지난 행사",
                start_date=date(2026, 7, 1),
                end_date=date(2026, 7, 2),
                location=ORIGIN,
                source_url="https://example.com/outside",
            )
        ],
        date(2026, 8, 12),
        route().polyline,
        DESTINATION,
        10000,
        10000,
        [],
        CHECKED_AT,
    )
    assert outside == []


def test_coordinate_free_event_requires_confirmation() -> None:
    events = normalize_candidates(
        [candidate("no-location", location=None)],
        date(2026, 8, 12),
        route().polyline,
        DESTINATION,
        10000,
        10000,
        [],
        CHECKED_AT,
    )
    signaled = apply_congestion_signals(events)
    assert signaled[0].congestion_signal is CongestionLevel.NEEDS_CONFIRMATION
    assert build_congestion_summary(signaled).level is CongestionLevel.NEEDS_CONFIRMATION


def test_empty_route_points_scope_events_to_destination_radius() -> None:
    near_destination = candidate("near-destination", location=DESTINATION)
    far_from_destination = candidate("far-from-destination", location=ORIGIN)

    events = normalize_candidates(
        [near_destination, far_from_destination],
        date(2026, 8, 12),
        [],
        DESTINATION,
        10_000,
        15_000,
        [],
        CHECKED_AT,
    )

    assert [event.id for event in events] == ["near-destination"]
    assert events[0].distance_to_route_meters is None


def test_confirmed_close_event_is_high_and_cancelled_is_removed() -> None:
    close = normalize_candidates(
        [candidate("close")],
        date(2026, 8, 12),
        route().polyline,
        DESTINATION,
        10000,
        10000,
        [],
        CHECKED_AT,
    )
    signaled = apply_congestion_signals(close)
    assert signaled[0].status is EventStatus.CONFIRMED
    assert signaled[0].congestion_signal is CongestionLevel.HIGH

    cancelled = candidate("cancelled").model_copy(update={"status": EventStatus.CANCELLED})
    assert normalize_candidates(
        [cancelled],
        date(2026, 8, 12),
        route().polyline,
        DESTINATION,
        10000,
        10000,
        [],
        CHECKED_AT,
    ) == []


@pytest.mark.parametrize(
    ("count", "level"),
    [
        (0, CongestionLevel.LOW),
        (2, CongestionLevel.LOW),
        (3, CongestionLevel.MEDIUM),
        (5, CongestionLevel.MEDIUM),
        (6, CongestionLevel.HIGH),
    ],
)
def test_event_density_uses_count_only_thresholds(
    count: int,
    level: CongestionLevel,
) -> None:
    summary = build_event_density_summary(count, radius_meters=15_000)

    assert summary.level is level
    assert summary.is_traffic_prediction is False
    assert "행사 밀집 가능성" in summary.summary


def test_event_density_is_unknown_when_provider_failed() -> None:
    summary = build_event_density_summary(None, radius_meters=15_000)

    assert summary.level is CongestionLevel.NEEDS_CONFIRMATION
    assert "확인하지 못했습니다" in summary.summary


@pytest.mark.parametrize("bad_value", [0, 20_001])
def test_route_buffer_domain_bound_is_enforced(bad_value: int) -> None:
    from app.schemas.travel_plan import TravelPlanRequest

    with pytest.raises(ValueError):
        TravelPlanRequest.model_validate(
            {
                "travelDate": "2026-10-03",
                "origin": "서울역",
                "destination": "부산 해운대",
                "clientPlatform": "IOS",
                "routeBufferMeters": bad_value,
            }
        )

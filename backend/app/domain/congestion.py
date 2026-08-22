from __future__ import annotations

from app.schemas.travel_plan import (
    CongestionLevel,
    CongestionSummary,
    EventConfidence,
    EventSummary,
)

EVENT_DENSITY_MEDIUM_THRESHOLD = 3
EVENT_DENSITY_HIGH_THRESHOLD = 6


def apply_congestion_signals(events: list[EventSummary]) -> list[EventSummary]:
    return [
        event.model_copy(update={"congestion_signal": signal_for_event(event)})
        for event in events
    ]


def signal_for_event(event: EventSummary) -> CongestionLevel:
    distance = (
        event.distance_to_route_meters
        if event.distance_to_route_meters is not None
        else event.distance_to_destination_meters
    )
    if distance is None or event.location is None:
        return CongestionLevel.NEEDS_CONFIRMATION
    if event.confidence is EventConfidence.LOW:
        return CongestionLevel.NEEDS_CONFIRMATION
    if distance <= 5_000 and event.status.value == "confirmed":
        return CongestionLevel.HIGH
    if distance <= 10_000:
        return CongestionLevel.MEDIUM
    if distance <= 20_000:
        return CongestionLevel.LOW
    return CongestionLevel.NEEDS_CONFIRMATION


def build_congestion_summary(events: list[EventSummary]) -> CongestionSummary:
    if not events:
        return CongestionSummary(
            level=CongestionLevel.LOW,
            summary="확인된 목적지 주변 행사가 없어 혼잡 가능성을 낮게 안내합니다.",
            reasons=["여행일과 겹치는 목적지 주변 행사가 확인되지 않았습니다."],
            isTrafficPrediction=False,
        )

    priority = {
        CongestionLevel.HIGH: 4,
        CongestionLevel.MEDIUM: 3,
        CongestionLevel.LOW: 2,
        CongestionLevel.NEEDS_CONFIRMATION: 1,
    }
    level = max((event.congestion_signal for event in events), key=priority.__getitem__)
    reasons = [_reason_for_event(event) for event in events[:3]]
    summaries = {
        CongestionLevel.HIGH: "여행일의 목적지 주변 혼잡 가능성이 높습니다.",
        CongestionLevel.MEDIUM: "여행일의 목적지 주변에 혼잡 가능성이 있는 행사가 있습니다.",
        CongestionLevel.LOW: "목적지 주변 행사로 인한 혼잡 가능성은 낮은 편입니다.",
        CongestionLevel.NEEDS_CONFIRMATION: "행사 위치 또는 출처 정보가 부족해 확인이 필요합니다.",
    }
    return CongestionSummary(
        level=level,
        summary=summaries[level],
        reasons=reasons,
        isTrafficPrediction=False,
    )


def build_event_density_summary(
    nearby_event_count: int | None,
    *,
    radius_meters: int,
    count_is_capped: bool = False,
) -> CongestionSummary:
    """Build the count-only MVP signal shown as destination event density.

    The response keeps the historical ``congestion`` contract key, but this
    stage intentionally describes event density rather than traffic delay.
    """
    if nearby_event_count is None:
        return CongestionSummary(
            level=CongestionLevel.NEEDS_CONFIRMATION,
            summary="목적지 주변 행사 밀집 가능성을 확인하지 못했습니다.",
            reasons=["행사 제공자 응답이 없어 행사 개수를 확인할 수 없습니다."],
            isTrafficPrediction=False,
        )

    if nearby_event_count >= EVENT_DENSITY_HIGH_THRESHOLD:
        level = CongestionLevel.HIGH
        summary = "목적지 주변 행사 밀집 가능성이 높습니다."
    elif nearby_event_count >= EVENT_DENSITY_MEDIUM_THRESHOLD:
        level = CongestionLevel.MEDIUM
        summary = "목적지 주변 행사 밀집 가능성이 보통입니다."
    else:
        level = CongestionLevel.LOW
        summary = "목적지 주변 행사 밀집 가능성이 낮습니다."

    count_text = f"{nearby_event_count}개 이상" if count_is_capped else f"{nearby_event_count}개"
    radius_km = radius_meters / 1_000
    return CongestionSummary(
        level=level,
        summary=summary,
        reasons=[
            f"여행일과 겹치는 목적지 반경 {radius_km:.0f}km 내 행사 후보가 "
            f"{count_text} 확인되었습니다.",
            "행사 상세정보와 실제 교통 지연시간은 아직 반영하지 않았습니다.",
        ],
        isTrafficPrediction=False,
    )


def _reason_for_event(event: EventSummary) -> str:
    if event.distance_to_route_meters is not None:
        distance_km = event.distance_to_route_meters / 1_000
        return (
            f"{event.title}의 행사 기간과 여행일이 겹치며, 행사장이 자동차 경로에서 "
            f"약 {distance_km:.1f}km 떨어져 있습니다."
        )
    if event.distance_to_destination_meters is not None:
        distance_km = event.distance_to_destination_meters / 1_000
        return (
            f"{event.title}의 행사 기간과 여행일이 겹치며, 행사장이 목적지에서 "
            f"약 {distance_km:.1f}km 떨어져 있습니다."
        )
    return f"{event.title}은 행사장 좌표가 없어 목적지와의 거리를 확인할 수 없습니다."

"use client";

import { useCallback, useMemo, useState } from "react";

import { NaverMapPreview } from "@/components/naver-map-preview";
import type {
  Coordinate,
  EventSummary,
  RouteSummary,
} from "@/lib/api/contracts";

interface RouteMapPreviewProps {
  route: RouteSummary;
  events: EventSummary[];
}

interface Point {
  x: number;
  y: number;
}

const naverMapClientId =
  process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID?.trim() ?? "";

export function RouteMapPreview({ route, events }: RouteMapPreviewProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [useCoordinateFallback, setUseCoordinateFallback] =
    useState(!naverMapClientId);
  const [fallbackReason, setFallbackReason] = useState(
    naverMapClientId
      ? ""
      : "웹용 Naver Maps client ID가 설정되지 않았습니다.",
  );
  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ?? null;
  const selectEvent = useCallback((event: EventSummary) => {
    setSelectedEventId((current) => (current === event.id ? null : event.id));
  }, []);
  const handleNaverUnavailable = useCallback((reason: string) => {
    setFallbackReason(reason);
    setUseCoordinateFallback(true);
  }, []);

  return (
    <section className="map-section" aria-labelledby="route-map-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">ROUTE PREVIEW</p>
          <h2 id="route-map-title">자동차 경로 지도</h2>
        </div>
        <span className="section-trailing">
          {useCoordinateFallback ? "좌표 미리보기" : "NAVER 지도 SDK"}
        </span>
      </div>
      <div
        className="route-map"
        role="group"
        aria-label="출발지와 여행지 사이 경로 지도"
      >
        {useCoordinateFallback ? (
          <CoordinateMapFallback
            events={events}
            onSelectEvent={selectEvent}
            route={route}
            selectedEventId={selectedEventId}
          />
        ) : (
          <NaverMapPreview
            events={events}
            onSelectEvent={selectEvent}
            onUnavailable={handleNaverUnavailable}
            route={route}
          />
        )}
        <MapLegend events={events} />
      </div>
      {selectedEvent ? (
        <div className="selected-event" role="status">
          <strong>{selectedEvent.title}</strong>
          <span>
            {selectedEvent.address ??
              selectedEvent.venue ??
              "행사 위치 확인 필요"}
          </span>
        </div>
      ) : null}
      <p className="map-note">
        {useCoordinateFallback
          ? `${fallbackReason} 좌표를 화면에 맞춰 투영한 참고용 경로입니다. 실제 교통량을 표시하지 않습니다.`
          : "Naver 지도에 Cloud Run이 반환한 자동차 경로와 좌표가 있는 행사 위치를 표시합니다. 지도는 읽기 전용 미리보기입니다."}
      </p>
    </section>
  );
}

interface CoordinateMapFallbackProps {
  route: RouteSummary;
  events: EventSummary[];
  selectedEventId: string | null;
  onSelectEvent: (event: EventSummary) => void;
}

function CoordinateMapFallback({
  route,
  events,
  selectedEventId,
  onSelectEvent,
}: CoordinateMapFallbackProps) {
  const projected = useMemo(
    () =>
      createProjection([
        route.origin,
        ...route.polyline,
        route.destination,
        ...eventCoordinates(events),
      ]),
    [events, route.destination, route.origin, route.polyline],
  );
  const routePoints =
    route.polyline.length > 0
      ? [route.origin, ...route.polyline, route.destination]
      : [route.origin, route.destination];
  const line = routePoints
    .map((coordinate) => toPointString(projected(coordinate)))
    .join(" ");

  return (
    <div className="route-map__fallback">
      <svg
        aria-labelledby="route-map-svg-title"
        className="route-map__svg"
        preserveAspectRatio="none"
        role="img"
        viewBox="0 0 100 100"
      >
        <title id="route-map-svg-title">
          출발지에서 여행지까지의 좌표 경로
        </title>
        <path
          className="route-map__grid-line route-map__grid-line--one"
          d="M8 28H92"
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="route-map__grid-line route-map__grid-line--two"
          d="M8 70H92"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          className="route-map__line"
          points={line}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        aria-hidden="true"
        className="route-map__point route-map__point--origin"
        style={positionStyle(projected(route.origin))}
      />
      <span
        aria-hidden="true"
        className="route-map__point route-map__point--destination"
        style={positionStyle(projected(route.destination))}
      />
      <span
        className="route-map__label route-map__label--origin"
        style={positionStyle(projected(route.origin))}
      >
        출발
      </span>
      <span
        className="route-map__label route-map__label--destination"
        style={positionStyle(projected(route.destination))}
      >
        도착
      </span>
      {events.map((event, index) => {
        if (!event.location) return null;
        const point = projected(event.location);
        return (
          <button
            aria-label={`${event.title} 행사 위치`}
            className={`route-map__event-marker ${selectedEventId === event.id ? "route-map__event-marker--selected" : ""}`}
            key={event.id}
            style={positionStyle(point)}
            type="button"
            onClick={() => onSelectEvent(event)}
          >
            {index + 1}
          </button>
        );
      })}
    </div>
  );
}

function MapLegend({ events }: { events: EventSummary[] }) {
  return (
    <div className="route-map__legend" aria-label="지도 범례">
      <span>
        <i className="legend-dot legend-dot--origin" />
        출발
      </span>
      <span>
        <i className="legend-dot legend-dot--destination" />
        도착
      </span>
      {events.some((event) => event.location) ? (
        <span>
          <i className="legend-dot legend-dot--event" />
          행사
        </span>
      ) : null}
    </div>
  );
}

function createProjection(
  coordinates: Coordinate[],
): (coordinate: Coordinate) => Point {
  const lats = coordinates.map((coordinate) => coordinate.lat);
  const lons = coordinates.map((coordinate) => coordinate.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latSpan = Math.max(maxLat - minLat, 0.0001);
  const lonSpan = Math.max(maxLon - minLon, 0.0001);
  return (coordinate) => ({
    x: 8 + ((coordinate.lon - minLon) / lonSpan) * 84,
    y: 92 - ((coordinate.lat - minLat) / latSpan) * 84,
  });
}

function eventCoordinates(events: EventSummary[]): Coordinate[] {
  return events.flatMap((event) => (event.location ? [event.location] : []));
}

function toPointString(point: Point): string {
  return `${point.x},${point.y}`;
}

function positionStyle(point: Point): React.CSSProperties {
  return { left: `${point.x}%`, top: `${point.y}%` };
}

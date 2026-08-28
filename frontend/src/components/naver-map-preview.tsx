"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  Coordinate,
  EventSummary,
  RouteSummary,
} from "@/lib/api/contracts";

interface NaverMapPreviewProps {
  route: RouteSummary;
  events: EventSummary[];
  onSelectEvent?: (event: EventSummary) => void;
  onUnavailable?: (reason: string) => void;
}

type MapStatus = "loading" | "ready" | "error";

interface NaverWindow extends Window {
  naver?: typeof naver;
  navermap_authFailure?: () => void;
}

const NAVER_MAP_SCRIPT_ID = "travel-congestion-naver-maps-sdk";
const NAVER_MAP_SCRIPT_URL =
  "https://oapi.map.naver.com/openapi/v3/maps.js";

let naverMapsPromise: Promise<void> | null = null;
let naverMapsClientId: string | null = null;

export function NaverMapPreview({
  route,
  events,
  onSelectEvent,
  onUnavailable,
}: NaverMapPreviewProps) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const overlaysRef = useRef<Array<naver.maps.Marker | naver.maps.Polyline>>(
    [],
  );
  const [status, setStatus] = useState<MapStatus>("loading");
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID?.trim() ?? "";
  const routeCoordinates = useMemo(
    () => [route.origin, ...route.polyline, route.destination],
    [route.destination, route.origin, route.polyline],
  );
  const mapCoordinates = useMemo(
    () => [
      ...routeCoordinates,
      ...events.flatMap((event) =>
        event.location ? [event.location] : [],
      ),
    ],
    [events, routeCoordinates],
  );

  useEffect(() => {
    let active = true;
    let authFailed = false;
    const browserWindow = window as NaverWindow;
    const previousAuthFailure = browserWindow.navermap_authFailure;
    const authFailure = () => {
      authFailed = true;
      if (active) {
        destroyMap(browserWindow, mapRef, overlaysRef);
        setStatus("error");
        onUnavailable?.(
          "Naver 지도 인증에 실패했습니다. 등록된 웹 서비스 URL을 확인해 주세요.",
        );
      }
    };

    const cleanup = () => {
      active = false;
      destroyMap(browserWindow, mapRef, overlaysRef);
      if (browserWindow.navermap_authFailure === authFailure) {
        browserWindow.navermap_authFailure = previousAuthFailure;
      }
    };

    if (!clientId || !mapElementRef.current) {
      setStatus("error");
      onUnavailable?.(
        "웹용 Naver Maps client ID가 설정되지 않아 좌표 미리보기를 사용합니다.",
      );
      return cleanup;
    }

    setStatus("loading");
    browserWindow.navermap_authFailure = authFailure;

    loadNaverMaps(clientId)
      .then(() => {
        if (
          !active ||
          authFailed ||
          !mapElementRef.current ||
          !browserWindow.naver?.maps
        ) {
          return;
        }

        const maps = browserWindow.naver.maps;
        const map = new maps.Map(mapElementRef.current, {
          background: "#eaf3ea",
          disableDoubleClickZoom: true,
          disableDoubleTapZoom: true,
          disableKineticPan: true,
          disableTwoFingerTapZoom: true,
          draggable: false,
          keyboardShortcuts: false,
          logoControl: true,
          mapDataControl: true,
          mapTypeControl: false,
          mapTypeId: maps.MapTypeId.NORMAL,
          pinchZoom: false,
          scaleControl: false,
          scrollWheel: false,
          tileTransition: false,
          zoomControl: false,
        });
        mapRef.current = map;

        const bounds = makeBounds(maps, mapCoordinates);
        map.fitBounds(bounds, {
          bottom: 48,
          left: 24,
          maxZoom: 12,
          right: 24,
          top: 58,
        });

        const path = routeCoordinates.map(toNaverCoordinate);
        overlaysRef.current.push(
          new maps.Polyline({
            clickable: false,
            map,
            path,
            strokeColor: "#1667d9",
            strokeLineCap: "round",
            strokeLineJoin: "round",
            strokeOpacity: 0.95,
            strokeWeight: 6,
            zIndex: 10,
          }),
        );
        overlaysRef.current.push(
          createLocationMarker(
            maps,
            map,
            routeCoordinates[0],
            "naver-map-marker naver-map-marker--origin",
            "출발",
            "출발지",
          ),
        );
        overlaysRef.current.push(
          createLocationMarker(
            maps,
            map,
            routeCoordinates[routeCoordinates.length - 1],
            "naver-map-marker naver-map-marker--destination",
            "도착",
            "여행지",
          ),
        );

        events.forEach((event, index) => {
          if (!event.location) return;
          const selectEvent = () => onSelectEvent?.(event);
          overlaysRef.current.push(
            createEventMarker(
              maps,
              map,
              event.location,
              index + 1,
              event.title,
              event.congestionSignal,
              selectEvent,
            ),
          );
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        destroyMap(browserWindow, mapRef, overlaysRef);
        setStatus("error");
        onUnavailable?.(
          "Naver 지도 SDK를 불러오지 못해 좌표 미리보기를 사용합니다.",
        );
      });

    return cleanup;
  }, [
    clientId,
    events,
    mapCoordinates,
    onSelectEvent,
    onUnavailable,
    routeCoordinates,
  ]);

  return (
    <div
      aria-label="출발지와 여행지 사이의 NAVER 지도 경로"
      className="route-map__canvas"
      data-map-status={status}
      ref={mapElementRef}
      role="img"
    >
      {status === "loading" ? (
        <div className="route-map__status" role="status">
          Naver 지도를 불러오고 있어요.
        </div>
      ) : null}
      {status === "error" ? (
        <div className="route-map__status route-map__status--error" role="status">
          지도를 준비하지 못해 대체 경로를 표시하고 있어요.
        </div>
      ) : null}
    </div>
  );
}

function loadNaverMaps(clientId: string): Promise<void> {
  const browserWindow = window as NaverWindow;
  if (browserWindow.naver?.maps) return Promise.resolve();
  if (naverMapsPromise && naverMapsClientId === clientId) {
    return naverMapsPromise;
  }

  naverMapsClientId = clientId;
  naverMapsPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(
      NAVER_MAP_SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (existingScript) {
      if (browserWindow.naver?.maps) {
        resolve();
        return;
      }
      existingScript.addEventListener("load", () => resolveIfReady(resolve, reject), {
        once: true,
      });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Naver Maps SDK script failed to load")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.dataset.clientId = clientId;
    script.id = NAVER_MAP_SCRIPT_ID;
    script.src = `${NAVER_MAP_SCRIPT_URL}?ncpKeyId=${encodeURIComponent(clientId)}`;
    script.addEventListener("load", () => resolveIfReady(resolve, reject), {
      once: true,
    });
    script.addEventListener(
      "error",
      () => reject(new Error("Naver Maps SDK script failed to load")),
      { once: true },
    );
    document.head.appendChild(script);
  });
  return naverMapsPromise;
}

function resolveIfReady(
  resolve: () => void,
  reject: (reason?: unknown) => void,
) {
  if ((window as NaverWindow).naver?.maps) {
    resolve();
  } else {
    reject(new Error("Naver Maps SDK did not expose naver.maps"));
  }
}

function destroyMap(
  browserWindow: NaverWindow,
  mapRef: { current: naver.maps.Map | null },
  overlaysRef: {
    current: Array<naver.maps.Marker | naver.maps.Polyline>;
  },
) {
  const maps = browserWindow.naver?.maps;
  overlaysRef.current.forEach((overlay) => {
    try {
      if (maps) maps.Event.clearInstanceListeners(overlay);
    } catch {
      // The SDK can be partially initialized when authentication fails.
    }
    try {
      overlay.setMap(null);
    } catch {
      // A failed SDK overlay may already have been detached internally.
    }
  });
  overlaysRef.current = [];
  try {
    mapRef.current?.destroy();
  } catch {
    // A failed SDK map may not support destruction after an auth failure.
  }
  mapRef.current = null;
}

function makeBounds(
  maps: typeof naver.maps,
  coordinates: Coordinate[],
): naver.maps.LatLngBounds {
  const lats = coordinates.map((coordinate) => coordinate.lat);
  const lons = coordinates.map((coordinate) => coordinate.lon);
  return new maps.LatLngBounds(
    new maps.LatLng(Math.min(...lats), Math.min(...lons)),
    new maps.LatLng(Math.max(...lats), Math.max(...lons)),
  );
}

function toNaverCoordinate(coordinate: Coordinate) {
  return { lat: coordinate.lat, lng: coordinate.lon };
}

function createLocationMarker(
  maps: typeof naver.maps,
  map: naver.maps.Map,
  coordinate: Coordinate,
  className: string,
  label: string,
  title: string,
): naver.maps.Marker {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = label;
  element.setAttribute("aria-hidden", "true");
  return new maps.Marker({
    clickable: false,
    icon: {
      anchor: new maps.Point(28, 34),
      content: element,
      size: new maps.Size(56, 34),
    },
    map,
    position: toNaverCoordinate(coordinate),
    title,
    zIndex: 30,
  });
}

function createEventMarker(
  maps: typeof naver.maps,
  map: naver.maps.Map,
  coordinate: Coordinate,
  index: number,
  title: string,
  congestionSignal: EventSummary["congestionSignal"],
  onSelect: () => void,
): naver.maps.Marker {
  const element = document.createElement("span");
  element.className = `naver-map-event-marker naver-map-event-marker--${congestionSignal}`;
  element.textContent = String(index);
  element.setAttribute("aria-label", `${title} 행사 위치`);
  element.setAttribute("role", "button");
  element.tabIndex = 0;
  element.addEventListener("click", onSelect);
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  });

  const marker = new maps.Marker({
    clickable: true,
    icon: {
      anchor: new maps.Point(16, 16),
      content: element,
      size: new maps.Size(32, 32),
    },
    map,
    position: toNaverCoordinate(coordinate),
    title,
    zIndex: 20,
  });
  return marker;
}

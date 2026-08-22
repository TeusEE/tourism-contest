import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import type { Coordinate, EventSummary, RouteSummary } from '@/src/api/contracts';
import { congestionColors } from '@/src/theme';
import { Text } from './Themed';

interface RouteMapPreviewProps {
  route: RouteSummary;
  events: EventSummary[];
  onSelectEvent?: (event: EventSummary) => void;
}

interface Point {
  x: number;
  y: number;
}

export function RouteMapPreview({ route, events, onSelectEvent }: RouteMapPreviewProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const coordinates = useMemo(
    () => [
      route.origin,
      ...route.polyline,
      route.destination,
      ...events.flatMap((event) => (event.location ? [event.location] : [])),
    ],
    [events, route.destination, route.origin, route.polyline],
  );
  const projection = useMemo(
    () => makeProjection(coordinates, size.width, size.height),
    [coordinates, size],
  );
  const routePoints =
    route.polyline.length > 0 ? route.polyline : [route.origin, route.destination];

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View
      accessibilityLabel="경로와 행사 위치 지도 미리보기"
      accessibilityRole="image"
      onLayout={onLayout}
      style={styles.map}
    >
      <View style={styles.mapHeader} pointerEvents="none">
        <Text style={styles.mapTitle}>경로 미리보기</Text>
        <Text style={styles.mapHint}>웹 좌표 미리보기</Text>
      </View>
      {size.width > 0 && projection ? (
        <>
          {routePoints.slice(0, -1).map((coordinate, index) => {
            const start = projection(coordinate);
            const end = projection(routePoints[index + 1]);
            return <RouteSegment key={`${index}-${coordinate.lat}`} start={start} end={end} />;
          })}
          <MapMarker
            coordinate={route.origin}
            projection={projection}
            color="#137A52"
            label="출발"
          />
          <MapMarker
            coordinate={route.destination}
            projection={projection}
            color="#B42318"
            label="도착"
          />
          {events.map((event, index) =>
            event.location ? (
              <Pressable
                accessibilityLabel={`${event.title} 행사 위치`}
                accessibilityRole="button"
                key={event.id}
                onPress={() => onSelectEvent?.(event)}
                style={[
                  styles.eventMarker,
                  {
                    backgroundColor: congestionColors[event.congestionSignal].foreground,
                    left: projection(event.location).x - 10,
                    top: projection(event.location).y - 10,
                  },
                ]}
              >
                <Text style={styles.markerText}>{index + 1}</Text>
              </Pressable>
            ) : null,
          )}
        </>
      ) : (
        <Text style={styles.emptyMap}>좌표를 바탕으로 경로를 준비하고 있습니다.</Text>
      )}
      <View style={styles.legend} pointerEvents="none">
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#137A52' }]} />
          <Text style={styles.legendText}>출발</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#B42318' }]} />
          <Text style={styles.legendText}>도착</Text>
        </View>
        <Text style={styles.legendText}>행사 위치는 상세 조회 단계에서 표시</Text>
      </View>
    </View>
  );
}

function RouteSegment({ start, end }: { start: Point; end: Point }) {
  const length = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
  const angle = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.routeSegment,
        {
          left: (start.x + end.x) / 2 - length / 2,
          top: (start.y + end.y) / 2 - 2,
          width: Math.max(2, length),
          transform: [{ rotate: `${angle}deg` }],
        },
      ]}
    />
  );
}

function MapMarker({
  coordinate,
  projection,
  color,
  label,
}: {
  coordinate: Coordinate;
  projection: (coordinate: Coordinate) => Point;
  color: string;
  label: string;
}) {
  const point = projection(coordinate);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.locationMarker,
        { left: point.x - 8, top: point.y - 8, backgroundColor: color },
      ]}
    >
      <Text style={styles.locationMarkerText}>{label}</Text>
    </View>
  );
}

function makeProjection(coordinates: Coordinate[], width: number, height: number) {
  if (width <= 0 || height <= 0 || coordinates.length === 0) return null;
  const lats = coordinates.map((coordinate) => coordinate.lat);
  const lons = coordinates.map((coordinate) => coordinate.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latSpan = Math.max(maxLat - minLat, 0.0001);
  const lonSpan = Math.max(maxLon - minLon, 0.0001);
  const padding = 28;
  const usableWidth = Math.max(1, width - padding * 2);
  const usableHeight = Math.max(1, height - padding * 2);
  const scale = Math.min(usableWidth / lonSpan, usableHeight / latSpan);
  const offsetX = (width - lonSpan * scale) / 2;
  const offsetY = (height - latSpan * scale) / 2;
  return (coordinate: Coordinate): Point => ({
    x: offsetX + (coordinate.lon - minLon) * scale,
    y: height - (offsetY + (coordinate.lat - minLat) * scale),
  });
}

const styles = StyleSheet.create({
  map: {
    height: 280,
    backgroundColor: '#EAF3EA',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D5E5D5',
  },
  mapHeader: { position: 'absolute', left: 16, right: 16, top: 14, zIndex: 4, gap: 2 },
  mapTitle: { fontSize: 14, fontWeight: '800', color: '#173B2A' },
  mapHint: { fontSize: 11, color: '#557263' },
  routeSegment: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1667D9',
    zIndex: 1,
  },
  locationMarker: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  locationMarkerText: {
    position: 'absolute',
    top: 15,
    color: '#173B2A',
    fontSize: 10,
    fontWeight: '800',
  },
  eventMarker: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    zIndex: 2,
  },
  markerText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  emptyMap: { flex: 1, textAlign: 'center', textAlignVertical: 'center', color: '#557263' },
  legend: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: '#557263' },
});

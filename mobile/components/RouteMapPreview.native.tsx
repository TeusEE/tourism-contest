import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  NaverMapMarkerOverlay,
  NaverMapPolylineOverlay,
  NaverMapView,
} from '@mj-studio/react-native-naver-map';

import type { Coordinate, EventSummary, RouteSummary } from '@/src/api/contracts';
import { Text } from './Themed';

interface RouteMapPreviewProps {
  route: RouteSummary;
  events: EventSummary[];
  onSelectEvent?: (event: EventSummary) => void;
}

const eventSymbols = {
  high: 'red',
  medium: 'yellow',
  low: 'green',
  'needs-confirmation': 'gray',
} as const;

export function RouteMapPreview({ route, events, onSelectEvent }: RouteMapPreviewProps) {
  const routeCoordinates = useMemo(
    () => [route.origin, ...route.polyline, route.destination].map(toNaverCoordinate),
    [route.destination, route.origin, route.polyline],
  );
  const mapRegion = useMemo(() => makeInitialRegion(route, events), [events, route]);

  return (
    <View
      accessibilityLabel="경로와 행사 위치 네이버 지도"
      accessibilityRole="image"
      style={styles.map}
    >
      <NaverMapView
        accessibilityLabel="경로와 행사 위치 네이버 지도"
        initialRegion={mapRegion}
        // The map is interactive. Swipes that start inside the map are
        // intentionally consumed by Naver so the user can pan the map;
        // the surrounding results ScrollView remains available outside it.
        isScrollGesturesEnabled={true}
        isZoomGesturesEnabled={false}
        isTiltGesturesEnabled={false}
        isRotateGesturesEnabled={false}
        pointerEvents="auto"
        isShowCompass={false}
        isShowScaleBar={false}
        isShowZoomControls={false}
        layerGroups={{
          BUILDING: true,
          TRAFFIC: false,
          TRANSIT: false,
          BICYCLE: false,
          MOUNTAIN: false,
          CADASTRAL: false,
        }}
        mapType="Basic"
        style={StyleSheet.absoluteFill}
        testID="naver-route-map"
      >
        <NaverMapPolylineOverlay coords={routeCoordinates} color="#1667D9" width={6} />
        <NaverMapMarkerOverlay
          anchor={{ x: 0.5, y: 1 }}
          caption={{ text: '출발' }}
          image={{ symbol: 'green' }}
          latitude={route.origin.lat}
          longitude={route.origin.lon}
        />
        <NaverMapMarkerOverlay
          anchor={{ x: 0.5, y: 1 }}
          caption={{ text: '도착' }}
          image={{ symbol: 'red' }}
          latitude={route.destination.lat}
          longitude={route.destination.lon}
        />
        {events.map((event, index) =>
          event.location ? (
            <NaverMapMarkerOverlay
              anchor={{ x: 0.5, y: 1 }}
              caption={{ text: `${index + 1}. ${event.title}` }}
              image={{ symbol: eventSymbols[event.congestionSignal] }}
              key={event.id}
              latitude={event.location.lat}
              longitude={event.location.lon}
              onTap={() => onSelectEvent?.(event)}
            />
          ) : null,
        )}
      </NaverMapView>
      <View pointerEvents="none" style={styles.mapHeader}>
        <Text style={styles.mapTitle}>경로 지도</Text>
        <Text style={styles.mapHint}>NAVER 지도 · 드래그하여 탐색</Text>
      </View>
      <View pointerEvents="none" style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#137A52' }]} />
          <Text style={styles.legendText}>출발</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#B42318' }]} />
          <Text style={styles.legendText}>도착</Text>
        </View>
        <Text style={styles.legendText}>행사 상세는 다음 단계에서 제공</Text>
      </View>
    </View>
  );
}

function toNaverCoordinate(coordinate: Coordinate) {
  return { latitude: coordinate.lat, longitude: coordinate.lon };
}

function makeInitialRegion(route: RouteSummary, events: EventSummary[]) {
  const coordinates = [
    route.origin,
    ...route.polyline,
    route.destination,
    ...events.flatMap((event) => (event.location ? [event.location] : [])),
  ];
  const lats = coordinates.map((coordinate) => coordinate.lat);
  const lons = coordinates.map((coordinate) => coordinate.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latitudeDelta = Math.max((maxLat - minLat) * 1.35, 0.02);
  const longitudeDelta = Math.max((maxLon - minLon) * 1.35, 0.02);
  return {
    // Naver Map SDK's Region starts at the south-west corner, not the center.
    latitude: minLat - (latitudeDelta - (maxLat - minLat)) / 2,
    longitude: minLon - (longitudeDelta - (maxLon - minLon)) / 2,
    latitudeDelta,
    longitudeDelta,
  };
}

const styles = StyleSheet.create({
  map: {
    height: 280,
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D5E5D5',
    backgroundColor: '#EAF3EA',
  },
  mapHeader: { position: 'absolute', top: 14, right: 16, left: 16, gap: 2 },
  mapTitle: { fontSize: 14, fontWeight: '800', color: '#173B2A' },
  mapHint: { fontSize: 11, color: '#557263' },
  legend: {
    position: 'absolute',
    right: 14,
    bottom: 12,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: '#557263' },
});

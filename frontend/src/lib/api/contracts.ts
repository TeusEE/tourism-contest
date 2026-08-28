export type ClientPlatform = "IOS" | "AND";

export const WEB_CLIENT_PLATFORM: ClientPlatform = "AND";

export type CongestionLevel = "high" | "medium" | "low" | "needs-confirmation";
export type EventConfidence = "high" | "medium" | "low";
export type EventStatus = "confirmed" | "candidate" | "changed" | "cancelled";
export type EventType = "festival" | "performance" | "sports" | "other";
export type SourceType = "visitkorea" | "local-gov" | "organizer";
export type VisitorStatus = "available" | "no-data" | "failed";
export type WeatherStatus =
  "available" | "not-yet-published" | "no-data" | "failed";
export type WeatherCondition =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "rain"
  | "snow"
  | "rain-snow"
  | "unknown";
export type WarningScope = "analysis" | "events" | "visitor" | "weather";
export type WarningSeverity = "info" | "warning";

export interface Coordinate {
  lat: number;
  lon: number;
}

export type LocationInput = string | Coordinate;

export interface LocationSuggestion {
  name: string;
  address: string | null;
  roadAddress: string | null;
  location: Coordinate;
}

export interface LocationSuggestionResponse {
  items: LocationSuggestion[];
}

export interface TravelPlanRequest {
  travelDate: string;
  origin: LocationInput;
  destination: LocationInput;
  departureTime?: string;
  clientPlatform: ClientPlatform;
  routeBufferMeters?: number;
  destinationRadiusMeters?: number;
  eventKeywords?: string[];
}

export interface RouteSummary {
  origin: Coordinate;
  destination: Coordinate;
  distanceMeters: number;
  durationSeconds: number;
  polyline: Coordinate[];
}

export interface CongestionSummary {
  level: CongestionLevel;
  summary: string;
  reasons: string[];
  isTrafficPrediction: false;
}

export interface EventSummary {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  venue: string | null;
  address: string | null;
  location: Coordinate | null;
  eventType: EventType;
  keywords: string[];
  sourceType: SourceType;
  sourceUrl: string | null;
  sourceName: string;
  confidence: EventConfidence;
  status: EventStatus;
  distanceToRouteMeters: number | null;
  distanceToDestinationMeters: number | null;
  checkedAt: string;
  congestionSignal: CongestionLevel;
}

export interface VisitorReference {
  status: VisitorStatus;
  referenceDate: string | null;
  region: string | null;
  visitorCount: number | null;
  concentrationRate: number | null;
  isForecast: false;
  sourceName: string;
  note: string;
}

export interface WeatherForecast {
  forecastAt: string;
  condition: WeatherCondition;
  temperatureC: number | null;
  precipitationProbabilityPercent: number | null;
  precipitationMm: number | null;
}

export interface WeatherSummary {
  status: WeatherStatus;
  targetDate: string;
  summary: string | null;
  forecasts: WeatherForecast[];
  note: string | null;
  checkedAt: string;
}

export interface Warning {
  code: string;
  scope: WarningScope;
  severity: WarningSeverity;
  message: string;
  eventId: string | null;
}

export interface TravelPlanAnalysisResponse {
  travelDate: string;
  route: RouteSummary;
  congestion: CongestionSummary;
  events: EventSummary[];
  nearbyEventCount: number | null;
  nearbyEventCountIsCapped: boolean;
  visitorReference: VisitorReference | null;
  weather: WeatherSummary;
  warnings: Warning[];
  generatedAt: string;
}

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export interface ErrorResponse {
  requestId: string;
  error: {
    code: string;
    message: string;
    fields: FieldError[];
  };
}

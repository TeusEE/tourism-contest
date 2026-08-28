import type {
  CongestionLevel,
  Coordinate,
  ErrorResponse,
  EventConfidence,
  EventStatus,
  EventSummary,
  EventType,
  FieldError,
  LocationSuggestion,
  LocationSuggestionResponse,
  SourceType,
  TravelPlanAnalysisResponse,
  VisitorReference,
  VisitorStatus,
  Warning,
  WeatherCondition,
  WeatherForecast,
  WeatherStatus,
  WeatherSummary,
} from "./contracts";

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLocationSuggestionResponse(
  value: unknown,
): value is LocationSuggestionResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isLocationSuggestion)
  );
}

export function isTravelPlanAnalysisResponse(
  value: unknown,
): value is TravelPlanAnalysisResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.route) ||
    !isRecord(value.congestion) ||
    !isRecord(value.weather)
  ) {
    return false;
  }

  const route = value.route;
  const congestion = value.congestion;
  const weather = value.weather;
  return (
    isDateString(value.travelDate) &&
    isRouteSummary(route) &&
    isCongestionSummary(congestion) &&
    Array.isArray(value.events) &&
    value.events.every(isEventSummary) &&
    isNullableNonNegativeInteger(value.nearbyEventCount) &&
    typeof value.nearbyEventCountIsCapped === "boolean" &&
    (value.visitorReference === null ||
      isVisitorReference(value.visitorReference)) &&
    isWeatherSummary(weather) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isWarning) &&
    isDateTimeString(value.generatedAt)
  );
}

export function isErrorResponse(value: unknown): value is ErrorResponse {
  if (!isRecord(value) || !isRecord(value.error)) return false;
  const error = value.error;
  return (
    typeof value.requestId === "string" &&
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    Array.isArray(error.fields) &&
    error.fields.every(isFieldError)
  );
}

export function isCoordinate(value: unknown): value is Coordinate {
  return (
    isRecord(value) &&
    isFiniteNumber(value.lat) &&
    isFiniteNumber(value.lon) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    value.lon >= -180 &&
    value.lon <= 180
  );
}

function isLocationSuggestion(value: unknown): value is LocationSuggestion {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    isNullableString(value.address) &&
    isNullableString(value.roadAddress) &&
    isCoordinate(value.location)
  );
}

function isRouteSummary(value: Record<string, unknown>): boolean {
  return (
    isCoordinate(value.origin) &&
    isCoordinate(value.destination) &&
    isNonNegativeInteger(value.distanceMeters) &&
    isNonNegativeInteger(value.durationSeconds) &&
    Array.isArray(value.polyline) &&
    value.polyline.every(isCoordinate)
  );
}

function isCongestionSummary(value: Record<string, unknown>): boolean {
  return (
    isCongestionLevel(value.level) &&
    typeof value.summary === "string" &&
    isStringArray(value.reasons) &&
    value.isTrafficPrediction === false
  );
}

function isEventSummary(value: unknown): value is EventSummary {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    isDateString(value.startDate) &&
    isDateString(value.endDate) &&
    isNullableString(value.venue) &&
    isNullableString(value.address) &&
    (value.location === null || isCoordinate(value.location)) &&
    isEventType(value.eventType) &&
    isStringArray(value.keywords) &&
    isSourceType(value.sourceType) &&
    isNullableString(value.sourceUrl) &&
    typeof value.sourceName === "string" &&
    isEventConfidence(value.confidence) &&
    isEventStatus(value.status) &&
    isNullableNonNegativeInteger(value.distanceToRouteMeters) &&
    isNullableNonNegativeInteger(value.distanceToDestinationMeters) &&
    isDateTimeString(value.checkedAt) &&
    isCongestionLevel(value.congestionSignal)
  );
}

function isVisitorReference(value: unknown): value is VisitorReference {
  if (!isRecord(value)) return false;
  return (
    isVisitorStatus(value.status) &&
    (value.referenceDate === null || isDateString(value.referenceDate)) &&
    isNullableString(value.region) &&
    isNullableNonNegativeInteger(value.visitorCount) &&
    isNullablePercent(value.concentrationRate) &&
    value.isForecast === false &&
    typeof value.sourceName === "string" &&
    typeof value.note === "string"
  );
}

function isWeatherSummary(value: unknown): value is WeatherSummary {
  if (!isRecord(value)) return false;
  return (
    isWeatherStatus(value.status) &&
    isDateString(value.targetDate) &&
    isNullableString(value.summary) &&
    Array.isArray(value.forecasts) &&
    value.forecasts.every(isWeatherForecast) &&
    isNullableString(value.note) &&
    isDateTimeString(value.checkedAt)
  );
}

function isWeatherForecast(value: unknown): value is WeatherForecast {
  if (!isRecord(value)) return false;
  return (
    isDateTimeString(value.forecastAt) &&
    isWeatherCondition(value.condition) &&
    isNullableFiniteNumber(value.temperatureC) &&
    isNullablePercent(value.precipitationProbabilityPercent) &&
    isNullableNonNegativeNumber(value.precipitationMm)
  );
}

function isWarning(value: unknown): value is Warning {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === "string" &&
    isWarningScope(value.scope) &&
    isWarningSeverity(value.severity) &&
    typeof value.message === "string" &&
    isNullableString(value.eventId)
  );
}

function isFieldError(value: unknown): value is FieldError {
  return (
    isRecord(value) &&
    typeof value.field === "string" &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  );
}

function isDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = datePattern.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const parsed = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );
  return (
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() === Number(month) - 1 &&
    parsed.getUTCDate() === Number(day)
  );
}

function isDateTimeString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isCongestionLevel(value: unknown): value is CongestionLevel {
  return (
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "needs-confirmation"
  );
}

function isEventConfidence(value: unknown): value is EventConfidence {
  return value === "high" || value === "medium" || value === "low";
}

function isEventStatus(value: unknown): value is EventStatus {
  return (
    value === "confirmed" ||
    value === "candidate" ||
    value === "changed" ||
    value === "cancelled"
  );
}

function isEventType(value: unknown): value is EventType {
  return (
    value === "festival" ||
    value === "performance" ||
    value === "sports" ||
    value === "other"
  );
}

function isSourceType(value: unknown): value is SourceType {
  return (
    value === "visitkorea" || value === "local-gov" || value === "organizer"
  );
}

function isVisitorStatus(value: unknown): value is VisitorStatus {
  return value === "available" || value === "no-data" || value === "failed";
}

function isWeatherStatus(value: unknown): value is WeatherStatus {
  return (
    value === "available" ||
    value === "not-yet-published" ||
    value === "no-data" ||
    value === "failed"
  );
}

function isWeatherCondition(value: unknown): value is WeatherCondition {
  return (
    value === "clear" ||
    value === "partly-cloudy" ||
    value === "cloudy" ||
    value === "rain" ||
    value === "snow" ||
    value === "rain-snow" ||
    value === "unknown"
  );
}

function isWarningScope(value: unknown): boolean {
  return (
    value === "analysis" ||
    value === "events" ||
    value === "visitor" ||
    value === "weather"
  );
}

function isWarningSeverity(value: unknown): boolean {
  return value === "info" || value === "warning";
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isNullableNonNegativeNumber(value: unknown): value is number | null {
  return value === null || isNonNegativeNumber(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isNullablePercent(value: unknown): value is number | null {
  return (
    value === null || (isFiniteNumber(value) && value >= 0 && value <= 100)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

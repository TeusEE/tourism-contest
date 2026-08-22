import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type {
  ErrorResponse,
  LocationSuggestion,
  LocationSuggestionResponse,
  TravelPlanAnalysisResponse,
  TravelPlanRequest,
} from './contracts';
import type { AnalysisInput } from '@/src/state/validation';

export const ANALYSIS_TIMEOUT_MS = 55_000;
export const LOCATION_SUGGESTION_TIMEOUT_MS = 8_000;
export type ApiErrorKind = 'server' | 'network' | 'timeout' | 'cancelled' | 'invalid-response';

export class ApiClientError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly fields: ErrorResponse['error']['fields'];

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: {
      status?: number | null;
      code?: string | null;
      fields?: ErrorResponse['error']['fields'];
    } = {},
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.kind = kind;
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.fields = options.fields ?? [];
  }
}

export function getApiBaseUrl(): string {
  const configured =
    Constants.expoConfig?.extra?.apiBaseUrl ?? process.env.EXPO_PUBLIC_API_BASE_URL;
  return String(configured ?? 'http://localhost:8080').replace(/\/$/, '');
}

export async function requestLocationSuggestions(
  query: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<LocationSuggestion[]> {
  const normalized = query.trim();
  if (!normalized) return [];

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? LOCATION_SUGGESTION_TIMEOUT_MS;
  let timedOut = false;
  let removeExternalAbortListener: (() => void) | undefined;

  if (options.signal) {
    if (options.signal.aborted)
      throw new ApiClientError('cancelled', '장소 추천 요청이 취소되었습니다.');
    const onExternalAbort = () => controller.abort();
    options.signal.addEventListener('abort', onExternalAbort, { once: true });
    removeExternalAbortListener = () =>
      options.signal?.removeEventListener('abort', onExternalAbort);
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const params = new URLSearchParams({ q: normalized, limit: '5' });
    const response = await fetch(`${getApiBaseUrl()}/api/v1/locations/suggestions?${params}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const payload = await parseJson(response);
    if (!response.ok) throw serverError(response.status, payload);
    if (!isLocationSuggestionResponse(payload)) {
      throw new ApiClientError('invalid-response', '장소 추천 응답 형식을 확인하지 못했습니다.');
    }
    return payload.items;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (controller.signal.aborted) {
      if (timedOut) throw new ApiClientError('timeout', '장소 추천 시간이 초과되었습니다.');
      throw new ApiClientError('cancelled', '장소 추천 요청이 취소되었습니다.');
    }
    throw new ApiClientError('network', '장소 추천 서버에 연결하지 못했습니다.');
  } finally {
    clearTimeout(timeout);
    removeExternalAbortListener?.();
  }
}

export function toTravelPlanRequest(input: AnalysisInput): TravelPlanRequest {
  const request: TravelPlanRequest = {
    travelDate: input.travelDate,
    origin: input.origin.trim(),
    destination: input.destination.trim(),
    clientPlatform: Platform.OS === 'ios' ? 'IOS' : 'AND',
    eventKeywords: input.eventKeywords.map((keyword) => keyword.trim()).filter(Boolean),
  };
  if (input.departureTime.trim()) request.departureTime = input.departureTime.trim();
  return request;
}

export async function requestAnalysis(
  request: TravelPlanRequest,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<TravelPlanAnalysisResponse> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? ANALYSIS_TIMEOUT_MS;
  let timedOut = false;
  let removeExternalAbortListener: (() => void) | undefined;

  if (options.signal) {
    if (options.signal.aborted)
      throw new ApiClientError('cancelled', '분석 요청이 취소되었습니다.');
    const onExternalAbort = () => controller.abort();
    options.signal.addEventListener('abort', onExternalAbort, { once: true });
    removeExternalAbortListener = () =>
      options.signal?.removeEventListener('abort', onExternalAbort);
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/travel-plan/analyze`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    const payload = await parseJson(response);
    if (!response.ok) throw serverError(response.status, payload);
    if (!isTravelPlanAnalysisResponse(payload)) {
      throw new ApiClientError('invalid-response', '서버 응답 형식을 확인하지 못했습니다.');
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (controller.signal.aborted) {
      if (timedOut)
        throw new ApiClientError('timeout', '분석 시간이 초과되었습니다. 다시 시도해 주세요.');
      throw new ApiClientError('cancelled', '분석 요청이 취소되었습니다.');
    }
    throw new ApiClientError('network', '서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.');
  } finally {
    clearTimeout(timeout);
    removeExternalAbortListener?.();
  }
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ApiClientError('invalid-response', '서버 응답을 읽지 못했습니다.');
  }
}

function serverError(status: number, payload: unknown): ApiClientError {
  const error = isErrorResponse(payload) ? payload.error : undefined;
  const code = error?.code ?? null;
  return new ApiClientError('server', messageForServerError(code, status), {
    status,
    code,
    fields: error?.fields,
  });
}

function messageForServerError(code: string | null, status: number): string {
  const messages: Record<string, string> = {
    VALIDATION_ERROR: '입력 내용을 확인해 주세요.',
    LOCATION_NOT_FOUND: '출발지 또는 여행지를 확인하지 못했습니다.',
    LOCATION_SUGGESTIONS_UNAVAILABLE: '장소 추천을 불러오지 못했습니다.',
    ROUTE_UNAVAILABLE: '자동차 경로를 확인하지 못했습니다.',
    ANALYSIS_TIMEOUT: '분석 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
    RATE_LIMITED: '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
    UPSTREAM_ERROR: '외부 데이터 조회에 실패했습니다.',
  };
  return (
    messages[code ?? ''] ??
    (status >= 500 ? '서버 오류가 발생했습니다.' : '요청을 처리하지 못했습니다.')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  return (
    isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.code === 'string' &&
    typeof value.error.message === 'string'
  );
}

function isTravelPlanAnalysisResponse(value: unknown): value is TravelPlanAnalysisResponse {
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
    typeof value.travelDate === 'string' &&
    isCoordinate(route.origin) &&
    isCoordinate(route.destination) &&
    Array.isArray(route.polyline) &&
    route.polyline.every(isCoordinate) &&
    typeof route.distanceMeters === 'number' &&
    typeof route.durationSeconds === 'number' &&
    isCongestionLevel(congestion.level) &&
    Array.isArray(value.events) &&
    value.events.every(isEventSummary) &&
    (value.nearbyEventCount === null ||
      (typeof value.nearbyEventCount === 'number' && value.nearbyEventCount >= 0)) &&
    typeof value.nearbyEventCountIsCapped === 'boolean' &&
    isWeatherStatus(weather.status) &&
    Array.isArray(weather.forecasts) &&
    weather.forecasts.every(isWeatherForecast) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isWarning) &&
    (value.visitorReference === null || isVisitorReference(value.visitorReference)) &&
    typeof value.generatedAt === 'string'
  );
}

function isLocationSuggestionResponse(value: unknown): value is LocationSuggestionResponse {
  return isRecord(value) && Array.isArray(value.items) && value.items.every(isLocationSuggestion);
}

function isLocationSuggestion(value: unknown): value is LocationSuggestion {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    (typeof value.address === 'string' || value.address === null) &&
    (typeof value.roadAddress === 'string' || value.roadAddress === null) &&
    isCoordinate(value.location)
  );
}

function isCoordinate(value: unknown): value is { lat: number; lon: number } {
  return isRecord(value) && typeof value.lat === 'number' && typeof value.lon === 'number';
}

function isCongestionLevel(value: unknown): boolean {
  return (
    value === 'high' || value === 'medium' || value === 'low' || value === 'needs-confirmation'
  );
}

function isWeatherStatus(value: unknown): boolean {
  return (
    value === 'available' ||
    value === 'not-yet-published' ||
    value === 'no-data' ||
    value === 'failed'
  );
}

function isEventSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    isCongestionLevel(value.congestionSignal) &&
    (typeof value.distanceToDestinationMeters === 'number' ||
      value.distanceToDestinationMeters === null) &&
    (value.location === null || isCoordinate(value.location))
  );
}

function isWeatherForecast(value: unknown): boolean {
  return (
    isRecord(value) && typeof value.forecastAt === 'string' && isWeatherCondition(value.condition)
  );
}

function isWeatherCondition(value: unknown): boolean {
  return ['clear', 'partly-cloudy', 'cloudy', 'rain', 'snow', 'rain-snow', 'unknown'].includes(
    String(value),
  );
}

function isVisitorReference(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.isForecast === false &&
    (value.status === 'available' || value.status === 'no-data' || value.status === 'failed')
  );
}

function isWarning(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    (value.severity === 'info' || value.severity === 'warning')
  );
}

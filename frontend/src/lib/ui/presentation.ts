import type {
  VisitorStatus,
  WeatherCondition,
  WeatherStatus,
} from "@/lib/api/contracts";

export const congestionLabels = {
  high: "높음",
  medium: "보통",
  low: "낮음",
  "needs-confirmation": "확인 필요",
} as const;

export const congestionTones = {
  high: "danger",
  medium: "warning",
  low: "success",
  "needs-confirmation": "neutral",
} as const;

const warningTitles: Record<string, string> = {
  EVENTS_PROVIDER_FAILED: "행사 데이터 조회 실패",
  EVENTS_PARTIAL_FAILURE: "행사 일부 조회 실패",
  EVENT_DETAILS_PARTIAL_FAILURE: "행사 상세정보 일부 확인 필요",
  VISITOR_FAILED: "방문객 참고값 조회 실패",
  VISITOR_NO_DATA: "방문객 참고값 없음",
  WEATHER_FAILED: "날씨 조회 실패",
  WEATHER_NOT_YET_PUBLISHED: "날씨 예보 미발표",
  WEATHER_NO_DATA: "날씨 데이터 없음",
};

const visitorStatusLabels: Record<VisitorStatus, string> = {
  available: "참고값 확인",
  "no-data": "데이터 없음",
  failed: "조회 실패",
};

const weatherStatusLabels: Record<WeatherStatus, string> = {
  available: "예보 확인",
  "not-yet-published": "예보 미발표",
  "no-data": "데이터 없음",
  failed: "조회 실패",
};

const weatherConditionLabels: Record<WeatherCondition, string> = {
  clear: "맑음",
  "partly-cloudy": "구름 조금",
  cloudy: "흐림",
  rain: "비",
  snow: "눈",
  "rain-snow": "비 또는 눈",
  unknown: "확인 필요",
};

const apiErrorTitles: Record<string, string> = {
  VALIDATION_ERROR: "입력 확인",
  LOCATION_NOT_FOUND: "위치 확인 실패",
  ROUTE_UNAVAILABLE: "경로 확인 실패",
  ANALYSIS_TIMEOUT: "분석 시간 초과",
  RATE_LIMITED: "잠시 후 다시 시도",
  UPSTREAM_ERROR: "외부 데이터 조회 실패",
  UPSTREAM_INVALID_RESPONSE: "응답 형식 확인 필요",
};

export function warningTitle(code: string): string {
  return warningTitles[code] ?? "데이터 안내";
}

export function visitorStatusLabel(status: VisitorStatus): string {
  return visitorStatusLabels[status];
}

export function weatherStatusLabel(status: WeatherStatus): string {
  return weatherStatusLabels[status];
}

export function weatherConditionLabel(condition: WeatherCondition): string {
  return weatherConditionLabels[condition];
}

export function apiErrorTitle(code: string | null): string {
  return (code && apiErrorTitles[code]) || "분석 오류";
}

export function formatCheckedAt(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  return match ? `${match[1]} ${match[2]}` : value;
}

export function formatEventCount(
  count: number | null,
  isCapped: boolean,
): string {
  if (count === null) return "확인 필요";
  return isCapped ? `${count}개 이상` : `${count}개`;
}

export function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}분`;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

import type { FieldError, TravelPlanRequest } from "./contracts";
import { WEB_CLIENT_PLATFORM } from "./contracts";
import { isCoordinate } from "./guards";
import { isValidDateString } from "../analysis/validation";

export interface ParsedRequest<T> {
  value: T | null;
  errors: FieldError[];
}

export interface LocationSuggestionRequest {
  q: string;
  limit: number;
}

export function parseLocationSuggestionRequest(
  value: unknown,
): ParsedRequest<LocationSuggestionRequest> {
  if (!isRecord(value)) return invalidBody();
  const errors = unexpectedFields(value, ["q", "limit"]);
  const query = value.q;
  const limit = value.limit === undefined ? 5 : value.limit;

  if (typeof query !== "string") {
    errors.push(fieldError("q", "string", "검색어를 입력해 주세요."));
  } else if (query.trim().length < 2 || query.trim().length > 80) {
    errors.push(
      fieldError("q", "length", "장소 검색어는 2~80자로 입력해 주세요."),
    );
  }
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 5
  ) {
    errors.push(
      fieldError("limit", "range", "장소 추천 개수는 1~5 사이여야 합니다."),
    );
  }

  return {
    value:
      errors.length === 0
        ? { q: (query as string).trim(), limit: limit as number }
        : null,
    errors,
  };
}

export function parseTravelPlanRequest(
  value: unknown,
): ParsedRequest<TravelPlanRequest> {
  if (!isRecord(value)) return invalidBody();
  const errors = unexpectedFields(value, [
    "travelDate",
    "origin",
    "destination",
    "departureTime",
    "clientPlatform",
    "routeBufferMeters",
    "destinationRadiusMeters",
    "eventKeywords",
  ]);

  const travelDate = value.travelDate;
  const origin = value.origin;
  const destination = value.destination;
  const departureTime = value.departureTime;
  const clientPlatform = value.clientPlatform;
  const routeBufferMeters = value.routeBufferMeters;
  const destinationRadiusMeters = value.destinationRadiusMeters;
  const eventKeywords = value.eventKeywords;

  if (typeof travelDate !== "string" || !isValidDateString(travelDate)) {
    errors.push(fieldError("travelDate", "date", "여행일을 확인해 주세요."));
  }
  validateLocation(origin, "origin", errors);
  validateLocation(destination, "destination", errors);
  if (
    departureTime !== undefined &&
    (typeof departureTime !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(departureTime))
  ) {
    errors.push(
      fieldError("departureTime", "time", "출발 시각을 확인해 주세요."),
    );
  }
  if (clientPlatform !== WEB_CLIENT_PLATFORM) {
    errors.push(
      fieldError(
        "clientPlatform",
        "unsupported",
        "웹 분석 요청의 clientPlatform을 확인해 주세요.",
      ),
    );
  }
  validateRange("routeBufferMeters", routeBufferMeters, errors);
  validateRange("destinationRadiusMeters", destinationRadiusMeters, errors);

  const normalizedKeywords = normalizeKeywords(eventKeywords, errors);
  if (errors.length > 0) return { value: null, errors };

  const request: TravelPlanRequest = {
    travelDate: travelDate as string,
    origin: normalizeLocation(origin),
    destination: normalizeLocation(destination),
    clientPlatform: WEB_CLIENT_PLATFORM,
    eventKeywords: normalizedKeywords,
  };
  if (departureTime !== undefined)
    request.departureTime = departureTime as string;
  if (routeBufferMeters !== undefined)
    request.routeBufferMeters = routeBufferMeters as number;
  if (destinationRadiusMeters !== undefined) {
    request.destinationRadiusMeters = destinationRadiusMeters as number;
  }
  return { value: request, errors: [] };
}

function validateLocation(
  value: unknown,
  field: string,
  errors: FieldError[],
): void {
  if (!(
    (typeof value === "string" &&
      value.trim().length >= 1 &&
      value.trim().length <= 200) ||
    isCoordinate(value)
  )) {
    errors.push(
      fieldError(field, "location", "주소 또는 좌표를 확인해 주세요."),
    );
  }
}

function normalizeLocation(value: unknown): TravelPlanRequest["origin"] {
  if (typeof value === "string") return value.trim();
  if (isCoordinate(value)) return value;
  throw new Error("normalizeLocation called with an invalid location");
}

function validateRange(
  field: string,
  value: unknown,
  errors: FieldError[],
): void {
  if (value === undefined) return;
  if (
    !Number.isInteger(value) ||
    (value as number) < 1 ||
    (value as number) > 20_000
  ) {
    errors.push(
      fieldError(field, "range", `${field} 값은 1~20000 사이여야 합니다.`),
    );
  }
}

function normalizeKeywords(value: unknown, errors: FieldError[]): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) {
    errors.push(
      fieldError(
        "eventKeywords",
        "length",
        "관심 유형은 최대 10개까지 선택할 수 있습니다.",
      ),
    );
    return [];
  }
  const normalized: string[] = [];
  for (const item of value) {
    if (
      typeof item !== "string" ||
      item.trim().length < 1 ||
      item.trim().length > 40
    ) {
      errors.push(
        fieldError(
          "eventKeywords",
          "item",
          "관심 유형은 1~40자로 입력해 주세요.",
        ),
      );
      continue;
    }
    const keyword = item.trim();
    if (!normalized.includes(keyword)) normalized.push(keyword);
  }
  return normalized;
}

function invalidBody<T>(): ParsedRequest<T> {
  return {
    value: null,
    errors: [fieldError("body", "object", "JSON 객체를 입력해 주세요.")],
  };
}

function unexpectedFields(
  value: Record<string, unknown>,
  allowed: string[],
): FieldError[] {
  return Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .map((key) =>
      fieldError(key, "extra_forbidden", "지원하지 않는 필드입니다."),
    );
}

function fieldError(field: string, code: string, message: string): FieldError {
  return { field, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

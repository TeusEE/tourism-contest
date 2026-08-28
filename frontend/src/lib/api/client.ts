"use client";

import type {
  LocationSuggestion,
  TravelPlanAnalysisResponse,
  TravelPlanRequest,
} from "./contracts";
import { WEB_CLIENT_PLATFORM } from "./contracts";
import type { ApiErrorState } from "./errors";
import { invalidResponseError } from "./errors";
import {
  isErrorResponse,
  isLocationSuggestionResponse,
  isTravelPlanAnalysisResponse,
} from "./guards";
import type { AnalysisInput } from "../analysis/validation";

export const ANALYSIS_TIMEOUT_MS = 55_000;
export const LOCATION_SUGGESTION_TIMEOUT_MS = 8_000;

export class ApiClientError extends Error {
  readonly state: ApiErrorState;

  constructor(state: ApiErrorState) {
    super(state.message);
    this.name = "ApiClientError";
    this.state = state;
  }
}

export async function requestLocationSuggestions(
  query: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<LocationSuggestion[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  const { response, payload } = await requestJson(
    "/api/locations/suggestions",
    {
      method: "POST",
      body: JSON.stringify({ q: normalized, limit: 5 }),
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? LOCATION_SUGGESTION_TIMEOUT_MS,
    },
  );
  if (!response.ok) throw serverError(response, payload);
  if (!isLocationSuggestionResponse(payload)) {
    throw new ApiClientError(
      invalidResponseError("장소 추천 응답 형식을 확인하지 못했습니다."),
    );
  }
  return payload.items;
}

export function toTravelPlanRequest(input: AnalysisInput): TravelPlanRequest {
  const request: TravelPlanRequest = {
    travelDate: input.travelDate,
    origin: input.origin.trim(),
    destination: input.destination.trim(),
    clientPlatform: WEB_CLIENT_PLATFORM,
    eventKeywords: Array.from(
      new Set(
        input.eventKeywords.map((keyword) => keyword.trim()).filter(Boolean),
      ),
    ),
  };
  if (input.departureTime.trim())
    request.departureTime = input.departureTime.trim();
  return request;
}

export async function requestAnalysis(
  request: TravelPlanRequest,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<TravelPlanAnalysisResponse> {
  const { response, payload } = await requestJson("/api/travel-plan/analyze", {
    method: "POST",
    body: JSON.stringify(request),
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? ANALYSIS_TIMEOUT_MS,
  });
  if (!response.ok) throw serverError(response, payload);
  if (!isTravelPlanAnalysisResponse(payload)) {
    throw new ApiClientError(invalidResponseError());
  }
  return payload;
}

async function requestJson(
  path: string,
  options: {
    method: "GET" | "POST";
    body?: string;
    signal?: AbortSignal;
    timeoutMs: number;
  },
): Promise<{ response: Response; payload: unknown }> {
  const controller = new AbortController();
  let timedOut = false;
  let removeExternalAbortListener: (() => void) | undefined;
  if (options.signal) {
    if (options.signal.aborted) throw new ApiClientError(cancelledState());
    const onExternalAbort = () => controller.abort();
    options.signal.addEventListener("abort", onExternalAbort, { once: true });
    removeExternalAbortListener = () =>
      options.signal?.removeEventListener("abort", onExternalAbort);
  }
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);

  try {
    const response = await fetch(path, {
      method: options.method,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body,
      cache: "no-store",
      signal: controller.signal,
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ApiClientError(
        invalidResponseError("서버 응답을 읽지 못했습니다."),
      );
    }
    return { response, payload };
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (controller.signal.aborted) {
      if (timedOut) throw new ApiClientError(timeoutState());
      throw new ApiClientError(cancelledState());
    }
    throw new ApiClientError(networkState());
  } finally {
    clearTimeout(timeout);
    removeExternalAbortListener?.();
  }
}

function serverError(response: Response, payload: unknown): ApiClientError {
  const structured = isErrorResponse(payload) ? payload : null;
  const code = structured?.error.code ?? null;
  const fields = structured?.error.fields ?? [];
  return new ApiClientError({
    kind: "server",
    message: messageForServerError(code, response.status),
    status: response.status,
    code,
    requestId: structured?.requestId ?? response.headers.get("x-request-id"),
    fields,
  });
}

function messageForServerError(code: string | null, status: number): string {
  const messages: Record<string, string> = {
    VALIDATION_ERROR: "입력 내용을 확인해 주세요.",
    LOCATION_NOT_FOUND: "출발지 또는 여행지를 확인하지 못했습니다.",
    LOCATION_SUGGESTIONS_UNAVAILABLE: "장소 추천을 불러오지 못했습니다.",
    LOCATION_SUGGESTIONS_TIMEOUT: "장소 추천 시간이 초과되었습니다.",
    ROUTE_UNAVAILABLE: "자동차 경로를 확인하지 못했습니다.",
    ANALYSIS_TIMEOUT: "분석 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
    RATE_LIMITED: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
    UPSTREAM_ERROR: "외부 데이터 조회에 실패했습니다.",
    UPSTREAM_INVALID_RESPONSE: "서버 응답을 확인하지 못했습니다.",
    UPSTREAM_NOT_CONFIGURED: "분석 서버 설정을 확인하지 못했습니다.",
  };
  return (
    messages[code ?? ""] ??
    (status >= 500
      ? "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
      : "요청을 처리하지 못했습니다.")
  );
}

function cancelledState(): ApiErrorState {
  return {
    kind: "cancelled",
    message: "분석 요청을 취소했습니다.",
    status: null,
    code: "REQUEST_CANCELLED",
    requestId: null,
    fields: [],
  };
}

function timeoutState(): ApiErrorState {
  return {
    kind: "timeout",
    message: "분석 시간이 초과되었습니다. 다시 시도해 주세요.",
    status: 504,
    code: "ANALYSIS_TIMEOUT",
    requestId: null,
    fields: [],
  };
}

function networkState(): ApiErrorState {
  return {
    kind: "network",
    message: "서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.",
    status: null,
    code: null,
    requestId: null,
    fields: [],
  };
}

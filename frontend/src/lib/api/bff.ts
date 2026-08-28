import { isErrorResponse } from "./guards";

export const MAX_REQUEST_BODY_BYTES = 64 * 1024;
export const LOCATION_SUGGESTION_TIMEOUT_MS = 8_000;
export const ANALYSIS_TIMEOUT_MS = 55_000;

export const CLOUD_RUN_PATHS = {
  locationSuggestions: "/api/v1/locations/suggestions",
  analysis: "/api/v1/travel-plan/analyze",
} as const;

type CloudRunPath = (typeof CLOUD_RUN_PATHS)[keyof typeof CLOUD_RUN_PATHS];

export type BffErrorKind =
  | "config"
  | "network"
  | "timeout"
  | "cancelled"
  | "invalid-response"
  | "request";

export class BffError extends Error {
  readonly kind: BffErrorKind;
  readonly status: number;
  readonly code: string;

  constructor(
    kind: BffErrorKind,
    message: string,
    options: { status: number; code: string },
  ) {
    super(message);
    this.name = "BffError";
    this.kind = kind;
    this.status = options.status;
    this.code = options.code;
  }
}

export interface CloudRunJsonResponse {
  status: number;
  ok: boolean;
  payload: unknown;
  requestId: string | null;
}

export function getCloudRunApiBaseUrl(): string {
  const configured = process.env.CLOUD_RUN_API_BASE_URL?.trim();
  if (!configured) {
    throw new BffError("config", "분석 서버 설정을 확인할 수 없습니다.", {
      status: 503,
      code: "UPSTREAM_NOT_CONFIGURED",
    });
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new BffError("config", "분석 서버 설정을 확인할 수 없습니다.", {
      status: 503,
      code: "UPSTREAM_NOT_CONFIGURED",
    });
  }

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new BffError("config", "분석 서버 설정을 확인할 수 없습니다.", {
      status: 503,
      code: "UPSTREAM_NOT_CONFIGURED",
    });
  }

  return url.toString().replace(/\/+$/, "");
}

export async function readJsonRequest(request: Request): Promise<unknown> {
  if (!isJsonContentType(request.headers.get("content-type"))) {
    throw new BffError(
      "request",
      "Content-Type은 application/json이어야 합니다.",
      { status: 415, code: "UNSUPPORTED_MEDIA_TYPE" },
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && isTooLarge(contentLength)) {
    throw new BffError("request", "요청 본문이 허용된 크기를 초과했습니다.", {
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    });
  }

  let body: ArrayBuffer;
  try {
    body = await request.arrayBuffer();
  } catch {
    throw new BffError("request", "요청 본문을 읽지 못했습니다.", {
      status: 400,
      code: "INVALID_JSON",
    });
  }
  if (body.byteLength > MAX_REQUEST_BODY_BYTES) {
    throw new BffError("request", "요청 본문이 허용된 크기를 초과했습니다.", {
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    });
  }

  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new BffError("request", "JSON 본문을 확인해 주세요.", {
      status: 400,
      code: "INVALID_JSON",
    });
  }
}

export async function requestCloudRunJson(
  path: CloudRunPath,
  options: {
    method: "GET" | "POST";
    body?: string;
    searchParams?: URLSearchParams;
    signal?: AbortSignal;
    timeoutMs: number;
    timeoutCode?: string;
    timeoutMessage?: string;
  },
): Promise<CloudRunJsonResponse> {
  const baseUrl = getCloudRunApiBaseUrl();
  const url = new URL(path, `${baseUrl}/`);
  if (options.searchParams) url.search = options.searchParams.toString();
  const controller = new AbortController();
  let timedOut = false;
  let removeExternalAbortListener: (() => void) | undefined;

  if (options.signal) {
    if (options.signal.aborted) {
      throw new BffError("cancelled", "요청이 취소되었습니다.", {
        status: 499,
        code: "REQUEST_CANCELLED",
      });
    }
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
    const response = await fetch(url, {
      method: options.method,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body,
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await parseJsonResponse(response);
    return {
      status: response.status,
      ok: response.ok,
      payload,
      requestId: response.headers.get("x-request-id"),
    };
  } catch (error) {
    if (error instanceof BffError) throw error;
    if (controller.signal.aborted) {
      if (timedOut) {
        throw new BffError(
          "timeout",
          options.timeoutMessage ?? "분석 서버 응답 시간이 초과되었습니다.",
          {
            status: 504,
            code: options.timeoutCode ?? "ANALYSIS_TIMEOUT",
          },
        );
      }
      throw new BffError("cancelled", "요청이 취소되었습니다.", {
        status: 499,
        code: "REQUEST_CANCELLED",
      });
    }
    throw new BffError("network", "분석 서버에 연결하지 못했습니다.", {
      status: 503,
      code: "UPSTREAM_ERROR",
    });
  } finally {
    clearTimeout(timeout);
    removeExternalAbortListener?.();
  }
}

export function jsonResponse(
  payload: unknown,
  status = 200,
  requestId?: string | null,
): Response {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  if (requestId) headers.set("X-Request-Id", requestId);
  return new Response(JSON.stringify(payload), { status, headers });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
  fields: Array<{ field: string; code: string; message: string }> = [],
): Response {
  return jsonResponse(
    {
      requestId,
      error: { code, message, fields },
    },
    status,
    requestId,
  );
}

export function bffErrorResponse(error: unknown, requestId: string): Response {
  if (error instanceof BffError) {
    return errorResponse(error.status, error.code, error.message, requestId);
  }
  return errorResponse(
    500,
    "INTERNAL_ERROR",
    "요청을 처리하지 못했습니다.",
    requestId,
  );
}

export function forwardUpstreamError(
  response: CloudRunJsonResponse,
  requestId: string,
): Response {
  if (isErrorResponse(response.payload)) {
    return errorResponse(
      response.status,
      response.payload.error.code,
      response.payload.error.message,
      requestId,
      response.payload.error.fields,
    );
  }

  return errorResponse(
    response.status >= 500 ? 502 : response.status,
    response.status >= 500 ? "UPSTREAM_ERROR" : "REQUEST_REJECTED",
    response.status >= 500
      ? "외부 데이터 제공자와 통신하지 못했습니다."
      : "요청을 처리하지 못했습니다.",
    requestId,
  );
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new BffError(
      "invalid-response",
      "분석 서버 응답 형식을 확인하지 못했습니다.",
      { status: 502, code: "UPSTREAM_INVALID_RESPONSE" },
    );
  }
}

function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  const mediaType = value.split(";", 1)[0].trim().toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

function isTooLarge(value: string): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > MAX_REQUEST_BODY_BYTES;
}

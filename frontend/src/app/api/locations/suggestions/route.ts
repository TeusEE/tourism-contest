import { randomUUID } from "node:crypto";

import {
  CLOUD_RUN_PATHS,
  LOCATION_SUGGESTION_TIMEOUT_MS,
  bffErrorResponse,
  errorResponse,
  forwardUpstreamError,
  jsonResponse,
  readJsonRequest,
  requestCloudRunJson,
} from "@/lib/api/bff";
import { isLocationSuggestionResponse } from "@/lib/api/guards";
import { parseLocationSuggestionRequest } from "@/lib/api/request-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const parsed = parseLocationSuggestionRequest(
      await readJsonRequest(request),
    );
    if (!parsed.value) {
      return errorResponse(
        422,
        "VALIDATION_ERROR",
        "요청 값을 확인해 주세요.",
        requestId,
        parsed.errors,
      );
    }

    const params = new URLSearchParams({
      q: parsed.value.q,
      limit: String(parsed.value.limit),
    });
    const upstream = await requestCloudRunJson(
      CLOUD_RUN_PATHS.locationSuggestions,
      {
        method: "GET",
        searchParams: params,
        signal: request.signal,
        timeoutMs: LOCATION_SUGGESTION_TIMEOUT_MS,
        timeoutCode: "LOCATION_SUGGESTIONS_TIMEOUT",
        timeoutMessage: "장소 추천 시간이 초과되었습니다.",
      },
    );
    if (!upstream.ok) return forwardUpstreamError(upstream, requestId);
    if (!isLocationSuggestionResponse(upstream.payload)) {
      return errorResponse(
        502,
        "UPSTREAM_INVALID_RESPONSE",
        "장소 추천 응답 형식을 확인하지 못했습니다.",
        requestId,
      );
    }
    return jsonResponse(upstream.payload, 200, requestId);
  } catch (error) {
    return bffErrorResponse(error, requestId);
  }
}

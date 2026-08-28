import { randomUUID } from "node:crypto";

import {
  ANALYSIS_TIMEOUT_MS,
  CLOUD_RUN_PATHS,
  bffErrorResponse,
  errorResponse,
  forwardUpstreamError,
  jsonResponse,
  readJsonRequest,
  requestCloudRunJson,
} from "@/lib/api/bff";
import { isTravelPlanAnalysisResponse } from "@/lib/api/guards";
import { parseTravelPlanRequest } from "@/lib/api/request-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const parsed = parseTravelPlanRequest(await readJsonRequest(request));
    if (!parsed.value) {
      return errorResponse(
        422,
        "VALIDATION_ERROR",
        "요청 값을 확인해 주세요.",
        requestId,
        parsed.errors,
      );
    }

    const upstream = await requestCloudRunJson(CLOUD_RUN_PATHS.analysis, {
      method: "POST",
      body: JSON.stringify(parsed.value),
      signal: request.signal,
      timeoutMs: ANALYSIS_TIMEOUT_MS,
    });
    if (!upstream.ok) return forwardUpstreamError(upstream, requestId);
    if (!isTravelPlanAnalysisResponse(upstream.payload)) {
      return errorResponse(
        502,
        "UPSTREAM_INVALID_RESPONSE",
        "분석 서버 응답 형식을 확인하지 못했습니다.",
        requestId,
      );
    }
    return jsonResponse(upstream.payload, 200, requestId);
  } catch (error) {
    return bffErrorResponse(error, requestId);
  }
}

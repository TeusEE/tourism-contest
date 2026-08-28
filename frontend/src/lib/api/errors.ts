import type { FieldError } from "./contracts";

export type ApiErrorKind =
  "server" | "network" | "timeout" | "cancelled" | "invalid-response";

export interface ApiErrorState {
  kind: ApiErrorKind;
  message: string;
  status: number | null;
  code: string | null;
  requestId: string | null;
  fields: FieldError[];
}

export function cancelledError(
  message = "분석 요청을 취소했습니다.",
): ApiErrorState {
  return {
    kind: "cancelled",
    message,
    status: null,
    code: null,
    requestId: null,
    fields: [],
  };
}

export function invalidResponseError(
  message = "서버 응답 형식을 확인하지 못했습니다.",
): ApiErrorState {
  return {
    kind: "invalid-response",
    message,
    status: null,
    code: "UPSTREAM_INVALID_RESPONSE",
    requestId: null,
    fields: [],
  };
}

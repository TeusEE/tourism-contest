from __future__ import annotations

import logging
import time
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.schemas.errors import ErrorDetail, ErrorResponse

logger = logging.getLogger("travel_congestion.request")


class RequestContextMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, max_request_body_bytes: int = 65_536) -> None:
        super().__init__(app)
        self._max_request_body_bytes = max_request_body_bytes

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = str(uuid4())
        request.state.request_id = request_id
        started = time.perf_counter()
        content_length = request.headers.get("content-length")
        limit = getattr(
            getattr(request.app.state, "settings", None),
            "max_request_body_bytes",
            None,
        )
        max_request_body_bytes = limit or self._max_request_body_bytes
        response: Response
        if content_length is not None and _is_too_large(content_length, max_request_body_bytes):
            response = _error_response(
                request_id,
                "PAYLOAD_TOO_LARGE",
                "요청 본문이 허용된 크기를 초과했습니다.",
                status_code=413,
            )
        elif (
            request.method == "POST"
            and request.url.path == "/api/v1/travel-plan/analyze"
            and not _is_json_content_type(request.headers.get("content-type"))
        ):
            response = _error_response(
                request_id,
                "UNSUPPORTED_MEDIA_TYPE",
                "Content-Type은 application/json이어야 합니다.",
                status_code=415,
            )
        else:
            try:
                if _is_analysis_request(request):
                    body_within_limit = await _cache_body_with_limit(
                        request,
                        max_request_body_bytes,
                    )
                    if not body_within_limit:
                        response = _error_response(
                            request_id,
                            "PAYLOAD_TOO_LARGE",
                            "요청 본문이 허용된 크기를 초과했습니다.",
                            status_code=413,
                        )
                    else:
                        response = await call_next(request)
                else:
                    response = await call_next(request)
            except Exception:
                logger.error(
                    "request_failed",
                    extra={
                        "request_id": request_id,
                        "method": request.method,
                        "path": request.url.path,
                    },
                )
                raise
        response.headers["X-Request-Id"] = request_id
        logger.info(
            "request_completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
            },
        )
        return response


def _is_too_large(value: str, limit: int) -> bool:
    try:
        return int(value) > limit
    except ValueError:
        return False


def _is_json_content_type(value: str | None) -> bool:
    if value is None:
        return False
    media_type = value.split(";", 1)[0].strip().lower()
    return media_type == "application/json" or media_type.endswith("+json")


def _is_analysis_request(request: Request) -> bool:
    return request.method == "POST" and request.url.path == "/api/v1/travel-plan/analyze"


async def _cache_body_with_limit(request: Request, limit: int) -> bool:
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            return False
        chunks.append(chunk)
    # BaseHTTPMiddleware's cached receive path replays _body to FastAPI.
    request._body = b"".join(chunks)
    return True


def _error_response(request_id: str, code: str, message: str, *, status_code: int) -> JSONResponse:
    payload = ErrorResponse(
        requestId=request_id,
        error=ErrorDetail(code=code, message=message),
    )
    return JSONResponse(status_code=status_code, content=payload.model_dump(by_alias=True))

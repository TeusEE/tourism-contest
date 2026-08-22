from __future__ import annotations

import logging
from collections.abc import Iterable

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.clients.errors import UpstreamError
from app.schemas.errors import ErrorDetail, ErrorResponse, FieldError

logger = logging.getLogger("travel_congestion.errors")


class AnalysisError(Exception):
    def __init__(self, code: str, message: str, status_code: int) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(code)


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):
        return await generic_exception_handler(request, exc)
    errors = list(exc.errors())
    invalid_json = any(error.get("type") == "json_invalid" for error in errors)
    code = "INVALID_JSON" if invalid_json else "VALIDATION_ERROR"
    message = "JSON 본문을 확인해 주세요." if invalid_json else "요청 값을 확인해 주세요."
    fields = [
        FieldError(
            field=_field_path(error.get("loc", ())),
            code=_validation_code(error),
            message=message,
        )
        for error in errors
    ]
    return _error_response(request, code, message, status_code=422, fields=fields)


async def analysis_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, AnalysisError):
        return await generic_exception_handler(request, exc)
    return _error_response(request, exc.code, exc.message, status_code=exc.status_code)


async def upstream_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, UpstreamError):
        return await generic_exception_handler(request, exc)
    code = "ROUTE_UNAVAILABLE" if exc.provider == "naver" else "UPSTREAM_ERROR"
    status_code = 502 if code == "ROUTE_UNAVAILABLE" else 503
    return _error_response(
        request,
        code,
        "외부 데이터 제공자와 통신하지 못했습니다.",
        status_code=status_code,
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "unhandled_exception",
        extra={"request_id": getattr(request.state, "request_id", "unknown")},
    )
    return _error_response(
        request,
        "INTERNAL_ERROR",
        "요청을 처리하지 못했습니다.",
        status_code=500,
    )


def install_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(AnalysisError, analysis_exception_handler)
    app.add_exception_handler(UpstreamError, upstream_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)


def _error_response(
    request: Request,
    code: str,
    message: str,
    *,
    status_code: int,
    fields: Iterable[FieldError] = (),
) -> JSONResponse:
    payload = ErrorResponse(
        requestId=getattr(request.state, "request_id", "unknown"),
        error=ErrorDetail(code=code, message=message, fields=list(fields)),
    )
    return JSONResponse(status_code=status_code, content=payload.model_dump(by_alias=True))


def _field_path(location: object) -> str:
    if not isinstance(location, tuple) and not isinstance(location, list):
        return "body"
    parts = [str(part) for part in location if part not in {"body", "query", "path"}]
    return ".".join(parts) or "body"


def _validation_code(error: dict[str, object]) -> str:
    error_type = str(error.get("type", "invalid"))
    return error_type.upper().replace(".", "_")

from __future__ import annotations

import json
import logging
from typing import Any


class StructuredFormatter(logging.Formatter):
    """Emit only explicitly supplied operational fields."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }
        for field in (
            "request_id",
            "method",
            "path",
            "status_code",
            "duration_ms",
            "provider",
            "provider_status",
        ):
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def configure_logging(level: str) -> None:
    root = logging.getLogger()
    root.setLevel(level)
    # httpx logs full request URLs at INFO; those URLs can contain provider
    # paths or query parameters, so keep transport logging out of application logs.
    logging.getLogger("httpx").setLevel(logging.CRITICAL)
    logging.getLogger("httpcore").setLevel(logging.CRITICAL)
    if not root.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(StructuredFormatter())
        root.addHandler(handler)

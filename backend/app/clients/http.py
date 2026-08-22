from __future__ import annotations

import asyncio
import logging
from collections.abc import Mapping
from typing import Any

import httpx

from app.clients.errors import (
    UpstreamDecodeError,
    UpstreamError,
    UpstreamHttpError,
    UpstreamTimeoutError,
)
from app.core.config import Settings

QueryValue = str | int | float
logger = logging.getLogger("travel_congestion.upstream")


class AsyncJsonClient:
    """Small provider-neutral JSON client with bounded retries and concurrency."""

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._owns_client = client is None
        timeout = httpx.Timeout(
            settings.request_timeout_seconds,
            connect=min(settings.request_timeout_seconds, 10.0),
        )
        self._client = client or httpx.AsyncClient(timeout=timeout)
        self._semaphore = asyncio.Semaphore(settings.max_concurrent_upstream_requests)

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def get_json(
        self,
        provider: str,
        url: str,
        *,
        params: Mapping[str, QueryValue] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> dict[str, Any]:
        attempts = 2
        for attempt in range(attempts):
            try:
                async with self._semaphore:
                    response = await self._client.get(url, params=params, headers=headers)
            except httpx.TimeoutException as exc:
                logger.warning(
                    "provider_request",
                    extra={"provider": provider, "provider_status": "timeout"},
                )
                if attempt + 1 < attempts:
                    await asyncio.sleep(0.05 * (attempt + 1))
                    continue
                raise UpstreamTimeoutError(provider) from exc
            except httpx.HTTPError as exc:
                logger.warning(
                    "provider_request",
                    extra={"provider": provider, "provider_status": "network-error"},
                )
                raise UpstreamError(provider, "NETWORK_ERROR", retryable=False) from exc

            if response.status_code < 400:
                try:
                    payload = response.json()
                except ValueError as exc:
                    logger.warning(
                        "provider_request",
                        extra={
                            "provider": provider,
                            "status_code": response.status_code,
                            "provider_status": "invalid-json",
                        },
                    )
                    raise UpstreamDecodeError(provider) from exc
                if not isinstance(payload, dict):
                    logger.warning(
                        "provider_request",
                        extra={
                            "provider": provider,
                            "status_code": response.status_code,
                            "provider_status": "invalid-json",
                        },
                    )
                    raise UpstreamDecodeError(provider)
                logger.info(
                    "provider_request",
                    extra={
                        "provider": provider,
                        "status_code": response.status_code,
                        "provider_status": "ok",
                    },
                )
                return payload

            error = UpstreamHttpError(provider, response.status_code)
            logger.warning(
                "provider_request",
                extra={
                    "provider": provider,
                    "status_code": response.status_code,
                    "provider_status": "http-error",
                },
            )
            if error.retryable and attempt + 1 < attempts:
                await asyncio.sleep(0.05 * (attempt + 1))
                continue
            raise error

        raise UpstreamError(provider, "UNKNOWN_ERROR")

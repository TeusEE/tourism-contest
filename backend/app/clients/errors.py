from __future__ import annotations


class UpstreamError(Exception):
    """Safe internal representation of an upstream failure.

    The exception deliberately carries provider metadata only. URLs, query strings,
    response bodies and credentials are never stored here so they cannot leak through
    an error response or a logger by accident.
    """

    def __init__(
        self,
        provider: str,
        code: str,
        *,
        status_code: int | None = None,
        retryable: bool = False,
    ) -> None:
        self.provider = provider
        self.code = code
        self.status_code = status_code
        self.retryable = retryable
        super().__init__(f"{provider}:{code}")


class ProviderConfigurationError(UpstreamError):
    def __init__(self, provider: str) -> None:
        super().__init__(provider, "MISSING_CONFIGURATION")


class UpstreamTimeoutError(UpstreamError):
    def __init__(self, provider: str) -> None:
        super().__init__(provider, "TIMEOUT", retryable=True)


class UpstreamHttpError(UpstreamError):
    def __init__(self, provider: str, status_code: int) -> None:
        super().__init__(
            provider,
            "HTTP_ERROR",
            status_code=status_code,
            retryable=status_code == 429 or status_code >= 500,
        )


class UpstreamDecodeError(UpstreamError):
    def __init__(self, provider: str) -> None:
        super().__init__(provider, "INVALID_JSON")


class UpstreamProviderError(UpstreamError):
    def __init__(self, provider: str, result_code: str) -> None:
        # Provider result codes are intentionally not retained: they may contain
        # provider-specific details that do not belong in public responses.
        super().__init__(provider, "PROVIDER_ERROR")


class LocationNotFoundError(UpstreamError):
    def __init__(self) -> None:
        super().__init__("naver", "LOCATION_NOT_FOUND")


class RouteNotFoundError(UpstreamError):
    def __init__(self) -> None:
        super().__init__("naver", "ROUTE_NOT_FOUND")

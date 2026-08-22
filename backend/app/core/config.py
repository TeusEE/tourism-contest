from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"

    # The same key is currently authorized for all three Korea Tourism APIs.
    data_go_kr_service_key: SecretStr = SecretStr("")
    ncp_maps_client_id: SecretStr | None = None
    ncp_maps_client_secret: SecretStr | None = None
    ncp_local_search_client_id: SecretStr | None = None
    ncp_local_search_client_secret: SecretStr | None = None
    mobile_app_name: str = "TravelCongestion"

    request_timeout_seconds: float = 60
    max_events_per_analysis: int = 100
    max_concurrent_upstream_requests: int = 10
    max_request_body_bytes: int = 65_536

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        validate_default=True,
    )

    @field_validator("log_level")
    @classmethod
    def normalize_log_level(cls, value: str) -> str:
        normalized = value.upper()
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        if normalized not in allowed:
            raise ValueError(f"LOG_LEVEL must be one of: {', '.join(sorted(allowed))}")
        return normalized

    @field_validator("data_go_kr_service_key")
    @classmethod
    def validate_service_key(cls, value: SecretStr) -> SecretStr:
        if not value.get_secret_value().strip():
            raise ValueError("DATA_GO_KR_SERVICE_KEY must be configured")
        return value

    @field_validator(
        "request_timeout_seconds",
        "max_events_per_analysis",
        "max_concurrent_upstream_requests",
        "max_request_body_bytes",
    )
    @classmethod
    def validate_positive_limits(cls, value: float | int) -> float | int:
        if value <= 0:
            raise ValueError("runtime limits must be greater than zero")
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

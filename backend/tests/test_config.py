import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_settings_require_the_tourism_service_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATA_GO_KR_SERVICE_KEY", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_settings_reject_non_positive_runtime_limits() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, data_go_kr_service_key="test-key", request_timeout_seconds=0)

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app


def test_health() -> None:
    get_settings.cache_clear()

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

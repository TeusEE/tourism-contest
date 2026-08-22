import json
from pathlib import Path

FIXTURE_ROOT = Path(__file__).parent / "fixtures"
FORBIDDEN_MARKERS = (
    "serviceKey",
    "x-ncp-apigw-api-key",
    "NCP_MAPS_CLIENT_SECRET",
    "Authorization",
)


def test_all_fixtures_are_valid_json_and_sanitized() -> None:
    fixture_files = sorted(FIXTURE_ROOT.rglob("*.json"))

    assert fixture_files
    for fixture_file in fixture_files:
        raw = fixture_file.read_text(encoding="utf-8")
        json.loads(raw)
        assert not any(marker in raw for marker in FORBIDDEN_MARKERS), fixture_file

#!/usr/bin/env python3
"""Run repository checks that can be verified without provider credentials.

The checker intentionally scans client artifacts and application source only. It
never reads or prints .env files, and it reports paths/reasons rather than
matching text that could contain a credential.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

TEXT_SUFFIXES = {
    ".js",
    ".jsx",
    ".json",
    ".mjs",
    ".ts",
    ".tsx",
    ".py",
    ".toml",
    ".yml",
    ".yaml",
    ".md",
    ".dockerignore",
}

MOBILE_SOURCE_PATHS = (
    ROOT / "mobile" / "app",
    ROOT / "mobile" / "components",
    ROOT / "mobile" / "src",
    ROOT / "mobile" / "app.config.ts",
)

MOBILE_ARTIFACT_PATHS = (
    *MOBILE_SOURCE_PATHS,
    ROOT / "mobile" / "dist",
    ROOT / "mobile" / "web-build",
    ROOT / "mobile" / "ios",
    ROOT / "mobile" / "android",
)

SERVER_PATHS = (ROOT / "backend" / "app",)

SERVER_SECRET_MARKERS = (
    "DATA_GO_KR_SERVICE_KEY",
    "NCP_MAPS_CLIENT_SECRET",
    "NCP_LOCAL_SEARCH_CLIENT_SECRET",
    "X-NCP-APIGW-API-KEY",
    "serviceKey",
)

PERSISTENCE_MARKERS = (
    "AsyncStorage",
    "SecureStore",
    "localStorage",
    "MMKV",
    "expo-sqlite",
    "sqlalchemy",
    "redis",
    "firebase_admin",
    "supabase",
)

SECRET_LITERAL_PATTERNS = (
    re.compile(r"(?i)(?:%2f|%2b|%3d)[a-z0-9%+/]{24,}"),
    re.compile(r"\b(?:AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,})\b"),
)


def main() -> int:
    issues: list[str] = []
    issues.extend(check_mobile_artifacts())
    issues.extend(check_backend_source())
    issues.extend(check_ignore_boundaries())
    issues.extend(check_tracked_files())

    if issues:
        print("M4 security checks failed:")
        for issue in issues:
            print(f"- {issue}")
        return 1

    print("M4 security checks passed: client artifacts, persistence markers, logs, and env boundaries")
    return 0


def check_mobile_artifacts() -> list[str]:
    issues: list[str] = []
    for path in iter_files(MOBILE_ARTIFACT_PATHS):
        text = read_text(path)
        if text is None:
            continue
        relative = path.relative_to(ROOT)
        for marker in SERVER_SECRET_MARKERS:
            if marker in text:
                issues.append(f"{relative} contains a server-only secret marker")
        for pattern in SECRET_LITERAL_PATTERNS:
            if pattern.search(text):
                issues.append(f"{relative} contains a credential-shaped literal")
        if is_under(path, MOBILE_SOURCE_PATHS):
            for marker in PERSISTENCE_MARKERS[:6]:
                if marker in text:
                    issues.append(f"{relative} contains a forbidden client persistence marker")
    return issues


def check_backend_source() -> list[str]:
    issues: list[str] = []
    for path in iter_files(SERVER_PATHS):
        text = read_text(path)
        if text is None:
            continue
        relative = path.relative_to(ROOT)
        for marker in PERSISTENCE_MARKERS[4:]:
            if marker in text:
                issues.append(f"{relative} contains an unexpected server persistence marker")
        for line_number, line in enumerate(text.splitlines(), start=1):
            if "logger." not in line:
                continue
            if any(
                marker in line
                for marker in (
                    "request.body",
                    "request.query_params",
                    "request.url.query",
                    "origin",
                    "destination",
                    "coordinate",
                    "polyline",
                )
            ):
                issues.append(f"{relative}:{line_number} may log user input or route coordinates")
    return issues


def check_ignore_boundaries() -> list[str]:
    issues: list[str] = []
    root_gitignore = read_text(ROOT / ".gitignore") or ""
    dockerignore = read_text(ROOT / "backend" / ".dockerignore") or ""
    if not any(line.strip() == ".env" for line in root_gitignore.splitlines()):
        issues.append(".gitignore must ignore .env")
    if not any(line.strip() == ".env" for line in dockerignore.splitlines()):
        issues.append("backend/.dockerignore must exclude .env from image context")
    return issues


def check_tracked_files() -> list[str]:
    """Scan tracked text for credential-shaped values without printing matches."""
    issues: list[str] = []
    tracked: set[Path] = set()
    for repository in (ROOT, ROOT / "mobile"):
        try:
            result = subprocess.run(
                ["git", "-C", str(repository), "ls-files", "-z"],
                check=False,
                capture_output=True,
            )
        except OSError:
            continue
        if result.returncode != 0:
            continue
        for relative in result.stdout.decode("utf-8", errors="ignore").split("\0"):
            if not relative:
                continue
            candidate = repository / relative
            if candidate.name.startswith(".env") and candidate.name != ".env.example":
                issues.append(f"{candidate.relative_to(ROOT)} is a tracked environment file")
                continue
            tracked.add(candidate)

    for path in tracked:
        text = read_text(path)
        if text is None:
            continue
        for pattern in SECRET_LITERAL_PATTERNS:
            if pattern.search(text):
                issues.append(f"{path.relative_to(ROOT)} contains a credential-shaped literal")
                break
    return issues


def iter_files(paths: tuple[Path, ...]) -> list[Path]:
    files: list[Path] = []
    excluded_parts = {"node_modules", ".git", "__pycache__", ".venv", ".expo"}
    for path in paths:
        if not path.exists():
            continue
        candidates = [path] if path.is_file() else list(path.rglob("*"))
        for candidate in candidates:
            if not candidate.is_file() or candidate.suffix not in TEXT_SUFFIXES:
                continue
            if any(part in excluded_parts for part in candidate.parts):
                continue
            if candidate.name.startswith(".env"):
                continue
            files.append(candidate)
    return files


def is_under(path: Path, roots: tuple[Path, ...]) -> bool:
    return any(path == root or root in path.parents for root in roots)


def read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None


if __name__ == "__main__":
    raise SystemExit(main())

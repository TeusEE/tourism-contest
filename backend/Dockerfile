FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN groupadd --system app && useradd --system --gid app app

COPY pyproject.toml README.md ./
COPY app ./app

RUN pip install .

USER app

# Cloud Run supplies PORT at runtime. 8080 is the local/default fallback.
ENV PORT=8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]

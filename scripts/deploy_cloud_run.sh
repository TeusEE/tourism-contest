#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ID="${PROJECT_ID:-travel-congestion}"
SERVICE_NAME="${SERVICE_NAME:-travel-congestion}"
REGION="${REGION:-asia-northeast3}"
RUNTIME_SERVICE_ACCOUNT_NAME="${RUNTIME_SERVICE_ACCOUNT_NAME:-travel-congestion-runtime}"
RUNTIME_SERVICE_ACCOUNT="${RUNTIME_SERVICE_ACCOUNT:-${RUNTIME_SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com}"
VERIFY_ANALYSIS="${VERIFY_ANALYSIS:-true}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd -- "${SCRIPT_DIR}/../backend" && pwd)"
ANALYSIS_RESPONSE_FILE=""

SECRET_NAMES=(
  travel-data-go-service-key
  travel-ncp-maps-client-id
  travel-ncp-maps-client-secret
  travel-ncp-local-search-client-id
  travel-ncp-local-search-client-secret
)

cleanup() {
  if [[ -n "${ANALYSIS_RESPONSE_FILE}" && -f "${ANALYSIS_RESPONSE_FILE}" ]]; then
    rm -f -- "${ANALYSIS_RESPONSE_FILE}"
  fi
}

on_error() {
  echo "배포 스크립트가 ${BASH_SOURCE[1]}:${BASH_LINENO[0]}에서 실패했습니다." >&2
}

trap cleanup EXIT
trap on_error ERR

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "필수 명령을 찾을 수 없습니다: $1" >&2
    exit 1
  fi
}

require_command gcloud
require_command curl
require_command jq

echo "[1/7] Google Cloud 프로젝트 확인: ${PROJECT_ID}"
gcloud projects describe "${PROJECT_ID}" --format='value(projectId)' >/dev/null

echo "[2/7] 배포에 필요한 Google Cloud API 확인"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  --project="${PROJECT_ID}" \
  --quiet

echo "[3/7] Secret 존재 여부 확인"
for secret_name in "${SECRET_NAMES[@]}"; do
  gcloud secrets describe "${secret_name}" \
    --project="${PROJECT_ID}" \
    --format='value(name)' >/dev/null
  echo "  확인됨: ${secret_name}"
done

echo "[4/7] Cloud Run 실행 계정 확인"
if ! gcloud iam service-accounts describe "${RUNTIME_SERVICE_ACCOUNT}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${RUNTIME_SERVICE_ACCOUNT_NAME}" \
    --project="${PROJECT_ID}" \
    --display-name="Travel Congestion Cloud Run runtime" \
    --quiet
fi
echo "  실행 계정: ${RUNTIME_SERVICE_ACCOUNT}"

echo "[5/7] Secret 접근 권한 부여"
for secret_name in "${SECRET_NAMES[@]}"; do
  gcloud secrets add-iam-policy-binding "${secret_name}" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet >/dev/null
  echo "  권한 확인됨: ${secret_name}"
done

echo "[6/7] Cloud Run 배포: ${SERVICE_NAME} (${REGION})"
cd -- "${BACKEND_DIR}"
gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --source=. \
  --region="${REGION}" \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=10 \
  --timeout=120s \
  --min-instances=0 \
  --max-instances=1 \
  --allow-unauthenticated \
  --service-account="${RUNTIME_SERVICE_ACCOUNT}" \
  --set-env-vars="APP_ENV=production,LOG_LEVEL=INFO,MOBILE_APP_NAME=TravelCongestion,REQUEST_TIMEOUT_SECONDS=120,REQUEST_CONNECT_TIMEOUT_SECONDS=30,MAX_EVENTS_PER_ANALYSIS=100,MAX_CONCURRENT_UPSTREAM_REQUESTS=10,MAX_REQUEST_BODY_BYTES=65536" \
  --set-secrets="DATA_GO_KR_SERVICE_KEY=travel-data-go-service-key:1,NCP_MAPS_CLIENT_ID=travel-ncp-maps-client-id:1,NCP_MAPS_CLIENT_SECRET=travel-ncp-maps-client-secret:1,NCP_LOCAL_SEARCH_CLIENT_ID=travel-ncp-local-search-client-id:1,NCP_LOCAL_SEARCH_CLIENT_SECRET=travel-ncp-local-search-client-secret:1" \
  --quiet

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')"

echo "[7/7] 배포 후 API 검증: ${SERVICE_URL}"
health_response="$(curl --fail --silent --show-error --max-time 30 "${SERVICE_URL}/health")"
if ! jq -e '.status == "ok"' >/dev/null <<<"${health_response}"; then
  echo "health 응답이 예상 형식과 다릅니다." >&2
  exit 1
fi
echo "  /health: OK"

suggestion_response="$(curl --fail --silent --show-error --max-time 30 --get \
  "${SERVICE_URL}/api/v1/locations/suggestions" \
  --data-urlencode 'q=서울역' \
  --data-urlencode 'limit=5')"
suggestion_count="$(jq -r '.items | length' <<<"${suggestion_response}")"
if [[ ! "${suggestion_count}" =~ ^[0-9]+$ || "${suggestion_count}" -lt 1 ]]; then
  echo "장소 추천 응답에 후보가 없습니다." >&2
  exit 1
fi
echo "  장소 추천: OK (${suggestion_count}개 후보)"

if [[ "${VERIFY_ANALYSIS}" == "true" ]]; then
  ANALYSIS_RESPONSE_FILE="$(mktemp -t travel-congestion-analysis)"
  analysis_status="$(curl --silent --show-error --max-time 75 \
    --output "${ANALYSIS_RESPONSE_FILE}" \
    --write-out '%{http_code}' \
    --request POST "${SERVICE_URL}/api/v1/travel-plan/analyze" \
    --header 'Accept: application/json' \
    --header 'Content-Type: application/json' \
    --data '{
      "origin": "서울특별시 용산구 한강대로 405",
      "destination": "부산광역시 동구 중앙대로 206",
      "travelDate": "2026-10-03",
      "clientPlatform": "IOS"
    }')"

  if [[ "${analysis_status}" != "200" ]]; then
    echo "분석 API가 HTTP ${analysis_status}를 반환했습니다." >&2
    jq -c '.error // .' "${ANALYSIS_RESPONSE_FILE}" >&2 || true
    exit 1
  fi
  if ! jq -e 'has("route") and has("events") and has("weather")' \
    "${ANALYSIS_RESPONSE_FILE}" >/dev/null; then
    echo "분석 API 응답에 필수 결과 필드가 없습니다." >&2
    exit 1
  fi
  echo "  전체 분석: OK (HTTP 200)"
fi

echo "배포 및 검증 완료"
echo "SERVICE_URL=${SERVICE_URL}"

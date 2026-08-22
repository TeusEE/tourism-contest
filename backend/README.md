# Travel Congestion Backend

Cloud Run에 배포할 수 있는 Python 3.11 기반 FastAPI 백엔드다. 외부 API 결과를 메모리에서만 조합해 목적지 주변 행사 개수·밀집 가능성·방문객 참고값·날씨를 반환한다. 행사 상세 조회는 후속 단계로 보류하며, 사용자 입력과 분석 결과는 영구 저장하지 않는다.

## 로컬 실행

`backend` 디렉터리에서 실행한다.

```bash
uv sync --extra dev
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8080
```

브라우저 또는 curl로 `http://localhost:8080/health`를 확인한다.

```json
{ "status": "ok" }
```

## 분석 API

`POST /api/v1/travel-plan/analyze`에 JSON 요청을 보내면 주소를 좌표로 변환하고 자동차 경로를 조회한 뒤, 목적지 반경 15km의 행사와 부가 정보를 분석한다. 주소 대신 좌표를 보낼 수도 있다.

```bash
curl -X POST http://localhost:8080/api/v1/travel-plan/analyze \\
  -H 'Content-Type: application/json' \\
  -H 'X-Request-Id: local-check-001' \\
  -d '{
    "origin": "서울역",
    "destination": "부산역",
    "travelDate": "2026-10-03",
    "routeBufferMeters": 5000,
    "destinationRadiusMeters": 15000,
    "eventKeywords": [],
    "clientPlatform": "IOS"
  }'
```

경로·주소 조회가 필수인 반면 행사·방문객·날씨는 일부 제공자 장애 시 `warnings`와 상태값을 포함한 부분 결과를 반환한다. 모든 응답에는 추적용 `X-Request-Id`가 포함되며, 요청 본문·좌표·외부 URL·인증키는 로그에 기록하지 않는다.

`routeBufferMeters`는 이전 계약과의 호환을 위해 허용하지만 현재 행사 검색에는 사용하지 않는다. 행사 API는 목적지 좌표 기준 반경 15km의 `locationBasedList2`만 호출한다.

## 장소명 입력과 주소 추천

`GET /api/v1/locations/suggestions?q=서울역&limit=5`는 장소명 후보를 조회한다. 분석 시 주소 Geocoding 결과가 없으면 NAVER API HUB Local Search를 fallback 호출해 장소명·주소·좌표를 정규화한다. Local Search 전용 인증정보가 없으면 기존 Maps 인증정보를 호환용으로 사용하며, 전용 인증정보가 일부만 설정되면 구성 오류로 처리한다. Local Search API 사용 권한이 없는 환경에서는 추천 요청이 `LOCATION_SUGGESTIONS_UNAVAILABLE`로 실패하지만, 도로명 주소를 직접 입력하는 분석은 계속 사용할 수 있다. 후보가 여러 개인 장소명은 잘못된 위치를 임의 선택하지 않으므로 후보를 선택하지 않고 제출하면 `LOCATION_NOT_FOUND`가 될 수 있다.

NAVER API 콘솔에서 Maps 외에 Local Search/Search API 사용 권한을 등록해야 장소명 추천과 fallback이 실제로 동작한다. 서버 키는 모바일 앱에 포함하지 않는다.

## 테스트와 검사

```bash
uv run pytest
uv run ruff check .
uv run mypy app
```

실제 장소 추천 확인:

```bash
curl --get 'http://localhost:8080/api/v1/locations/suggestions' \
  --data-urlencode 'q=서울역' \
  --data-urlencode 'limit=5'
```

테스트는 실제 API 키를 사용하지 않는다.

## Cloud Run 배포

Cloud Run은 Dockerfile의 `$PORT`를 사용한다. `backend/.env`는 이미지나 배포 명령에 포함하지 않는다.

```bash
gcloud run deploy travel-congestion-backend \
  --source . \
  --region asia-northeast3 \
  --allow-unauthenticated
```

배포 전에 Cloud Run 서비스의 환경변수에 다음 값을 등록한다.

```text
APP_ENV=production
LOG_LEVEL=INFO
DATA_GO_KR_SERVICE_KEY=<공공데이터포털_일반_인증키>
NCP_MAPS_CLIENT_ID=<네이버_지도_Client_ID>
NCP_MAPS_CLIENT_SECRET=<네이버_지도_Client_Secret>
NCP_LOCAL_SEARCH_CLIENT_ID=<NAVER_API_HUB_지역검색_Client_ID>
NCP_LOCAL_SEARCH_CLIENT_SECRET=<NAVER_API_HUB_지역검색_Client_Secret>
MOBILE_APP_NAME=TravelCongestion
REQUEST_TIMEOUT_SECONDS=60
MAX_EVENTS_PER_ANALYSIS=100
MAX_CONCURRENT_UPSTREAM_REQUESTS=10
MAX_REQUEST_BODY_BYTES=65536
```

네이버 지도 REST API에는 `NCP_MAPS_CLIENT_ID`와 `NCP_MAPS_CLIENT_SECRET`를, NAVER API HUB 지역 검색에는 `NCP_LOCAL_SEARCH_CLIENT_ID`와 `NCP_LOCAL_SEARCH_CLIENT_SECRET`를 Cloud Run 환경변수로 등록한다. NAVER·공공데이터·기상청 키는 환경변수로만 주입하며, 저장소의 `.env.example`에는 키 이름만 둔다.

환경변수는 Cloud Run Revision 설정에서 등록하고, 키가 셸 기록·Dockerfile·이미지·로그에 남지 않도록 한다.

# 모바일-백엔드 API 계약

이 문서는 [PRD](1-prd.md)의 `POST /api/v1/travel-plan/analyze` 계약을 백엔드 Pydantic 모델과 모바일 TypeScript 타입으로 공유하기 위한 기준이다. 상세한 필드 의미와 부분 성공 규칙은 [ERD/API 계약서](3-erd.md)를 기준으로 한다.

## 요청

```json
{
  "travelDate": "2026-10-03",
  "origin": "서울역",
  "destination": "부산 해운대",
  "departureTime": "08:00:00",
  "clientPlatform": "IOS",
  "routeBufferMeters": 10000,
  "destinationRadiusMeters": 15000,
  "eventKeywords": ["축제", "공연"]
}
```

`origin`과 `destination`은 주소 문자열 또는 `{ "lat": number, "lon": number }` 좌표 객체다. 좌표 변환은 백엔드가 담당하며, 앱이 종료되거나 화면을 벗어나면 입력을 영구 저장하지 않는다.

행사 검색은 목적지 좌표 기준 기본 반경 15km의 `locationBasedList2`를 요청당 한 번만 사용한다. `destinationRadiusMeters`는 1~20km 범위에서 조정할 수 있고, `routeBufferMeters`는 이전 계약과의 호환을 위해 남아 있지만 현재 행사 검색에는 사용하지 않는다. 행사 상세 조회는 현재 호출하지 않는다.

## 장소명 주소 후보 검색

`GET /api/v1/locations/suggestions?q={검색어}&limit={1~5}`

사용자가 `서울역`, `부산역`처럼 장소명만 입력할 때 모바일 입력창에서 후보를 표시한다. 백엔드는 NAVER API HUB Local Search 결과의 장소명, 지번 주소, 도로명 주소와 WGS84 좌표를 반환한다. 사용자가 후보를 선택하면 모바일 입력값을 도로명 주소로 바꾸어 분석 요청에 사용한다. 모바일은 300ms debounce를 적용하고 숫자가 포함된 완성형 도로명 주소에는 추천 요청을 보내지 않는다.

- `q`: trim 후 2~200자
- `limit`: 1~5, 기본값 5
- 후보가 여러 개인 장소명은 임의 선택하지 않으며 사용자가 후보를 선택해야 한다.
- 후보 선택 없이 모호한 장소명을 분석 요청에 그대로 보내면 `LOCATION_NOT_FOUND`가 될 수 있다.

분석 요청 자체는 기존처럼 주소 문자열을 받을 수 있으며, 백엔드는 NAVER Geocoding 결과가 없을 때 Local Search를 fallback으로 호출한다. Local Search 권한이 없거나 장애가 발생해도 추천 기능만 실패하고, 사용자가 도로명 주소를 직접 입력하거나 후보를 선택한 분석 흐름은 유지한다. Maps용 인증정보와 Local Search용 인증정보는 백엔드 환경변수에서 분리한다.

```json
{
  "items": [
    {
      "name": "서울역 (고속철도)",
      "address": "서울특별시 용산구 동자동 43-205",
      "roadAddress": "서울특별시 용산구 한강대로 405",
      "location": { "lat": 37.554073, "lon": 126.9707021 }
    }
  ]
}
```

## 응답 핵심 모델

```json
{
  "travelDate": "2026-10-03",
  "route": {
    "origin": { "lat": 37.5665, "lon": 126.978 },
    "destination": { "lat": 35.1587, "lon": 129.1604 },
    "distanceMeters": 400000,
    "durationSeconds": 18000,
    "polyline": []
  },
  "congestion": {
    "level": "high",
    "summary": "목적지 주변 행사 밀집 가능성이 높습니다.",
    "reasons": [
      "여행일과 겹치는 목적지 반경 15km 내 행사 후보가 6개 확인되었습니다."
    ],
    "isTrafficPrediction": false
  },
  "events": [],
  "nearbyEventCount": 6,
  "nearbyEventCountIsCapped": false,
  "visitorReference": null,
  "weather": {
    "status": "not-yet-published",
    "targetDate": "2026-10-03",
    "summary": null,
    "forecasts": [],
    "note": "여행일의 단기예보가 아직 발표되지 않았습니다.",
    "checkedAt": "2026-08-12T12:00:00+09:00"
  },
  "warnings": [
    {
      "code": "WEATHER_NOT_YET_PUBLISHED",
      "scope": "weather",
      "severity": "info",
      "message": "여행일의 단기예보가 아직 발표되지 않았습니다.",
      "eventId": null
    }
  ],
  "generatedAt": "2026-08-12T12:00:00+09:00"
}
```

현재 `congestion` 키는 기존 계약과의 호환을 위해 유지하지만, 화면에서는 `목적지 주변 행사 밀집 가능성`으로 표기한다. 행사 개수 규칙은 `0~2개=낮음`, `3~5개=보통`, `6개 이상=높음`이며, 행사 제공자 실패 시 `nearbyEventCount=null`과 `needs-confirmation`을 반환한다. `events`는 상세 조회를 시작하기 전까지 빈 배열이다. 날씨 상태는 `available`, `not-yet-published`, `no-data`, `failed`를 사용한다. `warnings`는 문자열이 아니라 코드·범위·심각도·메시지를 가진 객체 배열이다.

## 구현·검증 위치

- 백엔드 모델: `backend/app/schemas/travel_plan.py`
- 모바일 타입: `mobile/src/api/contracts.ts`
- 백엔드 계약 테스트: `backend/tests/test_contract.py`
- 모바일 계약 테스트: `mobile/src/api/client.test.ts`
- 장소 추천 API 테스트: `backend/tests/test_locations_api.py`
- 장소명 후보 파싱·좌표 형식 테스트: `backend/tests/test_clients.py`
- 상세 필드·부분 성공 규칙: `docs/3-erd.md`

로컬 실행 시 `backend/.env`에 `NCP_LOCAL_SEARCH_CLIENT_ID`와 `NCP_LOCAL_SEARCH_CLIENT_SECRET`를 등록한다. 두 값은 모바일에 포함하지 않는다.

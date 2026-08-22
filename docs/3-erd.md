# 모바일 앱–API 서버 JSON 데이터 계약

- 상태: MVP 구현·장소 추천·iOS Simulator 검증 기준
- 작성 기준일: 2026-08-20
- 기준 문서: [`1-prd.md`](1-prd.md)
- 목적: Expo 모바일 앱과 FastAPI 서버가 주고받는 JSON 필드, 자료형, Enum, 오류 형식을 단일 계약으로 정의

## 1. 범위와 원칙

MVP의 통신 엔드포인트는 다음 세 개다.

| Method | Path                            | 용도                            |
| ------ | ------------------------------- | ------------------------------- |
| `POST` | `/api/v1/travel-plan/analyze`   | 여행계획 분석 요청 및 동기 응답 |
| `GET`  | `/api/v1/locations/suggestions` | 장소명·주소 후보 검색           |
| `GET`  | `/health`                       | 서버 상태 확인                  |

- JSON 필드명은 `camelCase`를 사용한다.
- 분석 요청과 응답은 현재 HTTP 요청을 처리하는 동안에만 존재하며 저장하지 않는다.
- 분석 ID, 작업 ID, 결과 재조회 API는 제공하지 않는다.
- 행사·날씨·방문객 중 일부 조회가 실패해도 경로 분석이 가능하면 `200 OK`와 `warnings`를 반환한다.
- 주소 변환 또는 자동차 경로 생성에 실패해 분석 자체가 불가능하면 오류 응답을 반환한다.
- 모바일은 사용자 표시 문구가 아닌 Enum과 오류 `code`를 기준으로 화면 상태를 결정한다.
- 서버는 외부 API의 원문 오류, API 키, 내부 URL을 응답에 포함하지 않는다.

## 2. 공통 표현 규칙

| 항목         | 규칙                                                     |
| ------------ | -------------------------------------------------------- |
| Content-Type | 요청·응답 모두 `application/json; charset=utf-8`         |
| 날짜         | `YYYY-MM-DD`, 예: `2026-10-03`                           |
| 시각         | `HH:mm`, 대한민국 현지 예정 시각, 예: `08:00`            |
| 타임스탬프   | ISO 8601 및 시간대 포함, 예: `2026-08-09T12:00:00+09:00` |
| 좌표         | WGS84 십진수, `{ "lat": number, "lon": number }`         |
| 거리         | 정수 미터, 필드명 접미사 `Meters`                        |
| 시간 길이    | 정수 초, 필드명 접미사 `Seconds`                         |
| 비율         | `0` 이상 `100` 이하 숫자, 필드명 접미사 `Percent`        |
| 값 없음      | 의미 있는 필드는 생략하지 않고 `null`, 목록은 `[]`       |
| Enum         | 이 문서에 정의된 영문 문자열만 사용                      |

좌표 배열도 항상 객체 형태를 사용한다. GeoJSON의 `[lon, lat]` 배열과 혼동하지 않도록 숫자 배열은 사용하지 않는다.

서버는 모든 응답에 무작위 요청 식별자를 다음 헤더로 반환한다.

```http
X-Request-Id: 8de01c48-509f-4e57-b67b-2fd13d393419
```

이 값은 사용자 입력을 포함하지 않으며 오류 문의와 비식별 운영 로그 연결에만 사용한다.

## 3. 공통 자료형

### 3.1 `GeoPoint`

```json
{
  "lat": 37.554678,
  "lon": 126.970606
}
```

| 필드  | 형식   | 제약                   |
| ----- | ------ | ---------------------- |
| `lat` | number | `-90` 이상 `90` 이하   |
| `lon` | number | `-180` 이상 `180` 이하 |

### 3.2 `LocationInput`

출발지와 여행지는 주소 문자열 또는 `GeoPoint` 중 하나로 전달한다.

주소 입력:

```json
"서울역"
```

좌표 입력:

```json
{
  "lat": 37.554678,
  "lon": 126.970606
}
```

- 주소 문자열은 앞뒤 공백을 제거했을 때 1자 이상 200자 이하다.
- 좌표 객체에는 `lat`, `lon`을 모두 전달해야 한다.
- 모바일에서 장소명(`서울역`, `부산역`)을 입력하면 별도 후보 API에서 도로명 주소를 선택할 수 있다.
- 후보가 여러 개인 장소명을 선택하지 않고 그대로 분석하면 서버가 임의의 장소를 선택하지 않고 `LOCATION_NOT_FOUND`를 반환할 수 있다.
- 좌표를 전달한 경우 서버는 해당 위치의 역지오코딩이 실패해도 경로 생성이 가능하면 분석을 계속한다.

## 4. 장소명 주소 후보 검색

### `GET /api/v1/locations/suggestions`

쿼리 파라미터 `q`는 trim 후 2~~200자, `limit`은 1~~5이며 기본값은 5다. 모바일은 입력 중 300ms debounce와 요청 취소를 적용한다.

```http
GET /api/v1/locations/suggestions?q=%EC%84%9C%EC%9A%B8%EC%97%AD&limit=5
```

성공 응답:

```json
{
  "items": [
    {
      "name": "서울역 (고속철도)",
      "address": "서울특별시 용산구 동자동 43-205",
      "roadAddress": "서울특별시 용산구 한강대로 405",
      "location": {
        "lat": 37.554073,
        "lon": 126.9707021
      }
    }
  ]
}
```

`mapx`·`mapy`의 NAVER Local Search 10⁷배 정수 좌표를 백엔드가 WGS84 십진수로 변환한다. 모바일에서 후보를 선택하면 `roadAddress`를 분석 요청의 `origin` 또는 `destination`으로 사용한다. 제공자 미신청·장애 시 `503 LOCATION_SUGGESTIONS_UNAVAILABLE`을 반환하며, 주소 직접 입력은 계속 허용한다.

## 5. 여행 분석 요청

### `POST /api/v1/travel-plan/analyze`

요청 예시:

```json
{
  "travelDate": "2026-10-03",
  "origin": "서울역",
  "destination": "부산 해운대",
  "departureTime": "08:00",
  "clientPlatform": "IOS",
  "routeBufferMeters": 10000,
  "destinationRadiusMeters": 15000,
  "eventKeywords": ["축제", "공연"]
}
```

좌표를 사용하는 요청 예시:

```json
{
  "travelDate": "2026-10-03",
  "origin": {
    "lat": 37.554678,
    "lon": 126.970606
  },
  "destination": {
    "lat": 35.158698,
    "lon": 129.160384
  },
  "clientPlatform": "AND"
}
```

### 5.1 요청 필드

| 필드                      | 형식                     |   필수 | 기본값  | 제약·의미                                                |
| ------------------------- | ------------------------ | -----: | ------- | -------------------------------------------------------- |
| `travelDate`              | string(date)             |     예 | 없음    | 여행일, `YYYY-MM-DD`                                     |
| `origin`                  | `LocationInput`          |     예 | 없음    | 출발지 주소 또는 좌표                                    |
| `destination`             | `LocationInput`          |     예 | 없음    | 여행지 주소 또는 좌표                                    |
| `departureTime`           | string(time) 또는 `null` | 아니오 | `null`  | `HH:mm`, 대한민국 현지 시각                              |
| `clientPlatform`          | enum                     |     예 | 없음    | `IOS`, `AND` 중 하나                                     |
| `routeBufferMeters`       | integer                  | 아니오 | `10000` | 이전 계약 호환 필드이며 현재 행사 검색에는 사용하지 않음 |
| `destinationRadiusMeters` | integer                  | 아니오 | `15000` | `1` 이상 `20000` 이하, 목적지 반경 행사 검색             |
| `eventKeywords`           | string[]                 | 아니오 | `[]`    | 최대 10개, 항목당 1~40자, 중복 제거                      |

정의되지 않은 필드는 입력 오류로 처리한다. `clientPlatform`은 관광공사 API의 `MobileOS`에 그대로 전달 가능한 값만 허용한다.

### 5.2 요청 Enum

| 형식             | 허용값 | 의미       |
| ---------------- | ------ | ---------- |
| `ClientPlatform` | `IOS`  | iOS 앱     |
|                  | `AND`  | Android 앱 |

## 6. 여행 분석 성공 응답

경로 분석이 완료되면 부분 실패 여부와 관계없이 다음 최상위 구조를 반환한다.

```json
{
  "travelDate": "2026-10-03",
  "route": {
    "origin": {
      "lat": 37.554678,
      "lon": 126.970606
    },
    "destination": {
      "lat": 35.158698,
      "lon": 129.160384
    },
    "distanceMeters": 400000,
    "durationSeconds": 18000,
    "polyline": [
      {
        "lat": 37.554678,
        "lon": 126.970606
      },
      {
        "lat": 36.350412,
        "lon": 127.384548
      },
      {
        "lat": 35.158698,
        "lon": 129.160384
      }
    ]
  },
  "congestion": {
    "level": "high",
    "summary": "여행일의 목적지 주변 혼잡 가능성이 높습니다.",
    "reasons": [
      "여행일과 공식 축제 기간이 겹칩니다.",
      "행사장이 목적지에서 약 4.8km 떨어져 있습니다."
    ],
    "isTrafficPrediction": false
  },
  "events": [
    {
      "id": "runtime-event-id",
      "title": "지역 축제",
      "startDate": "2026-10-01",
      "endDate": "2026-10-10",
      "venue": "축제 장소",
      "address": "부산광역시 해운대구 예시로 1",
      "location": {
        "lat": 35.1632,
        "lon": 129.1636
      },
      "eventType": "festival",
      "keywords": ["축제", "공연"],
      "sourceType": "visitkorea",
      "sourceName": "한국관광공사",
      "sourceUrl": "https://example.com/event",
      "confidence": "high",
      "status": "confirmed",
      "distanceToRouteMeters": null,
      "distanceToDestinationMeters": 4800,
      "congestionSignal": "high",
      "checkedAt": "2026-08-09T12:00:00+09:00"
    }
  ],
  "visitorReference": {
    "status": "available",
    "referenceDate": "2025-10-03",
    "region": "부산광역시 해운대구",
    "visitorCount": 32145,
    "concentrationRate": null,
    "isForecast": false,
    "sourceName": "한국관광공사",
    "note": "과거 참고값이며 여행일의 미래 방문객 수 예측이 아닙니다."
  },
  "weather": {
    "status": "available",
    "targetDate": "2026-10-03",
    "summary": "오전 비, 오후 흐림",
    "forecasts": [
      {
        "forecastAt": "2026-10-03T09:00:00+09:00",
        "condition": "rain",
        "temperatureC": 19.2,
        "precipitationProbabilityPercent": 70,
        "precipitationMm": 2.5
      },
      {
        "forecastAt": "2026-10-03T15:00:00+09:00",
        "condition": "cloudy",
        "temperatureC": 22.1,
        "precipitationProbabilityPercent": 30,
        "precipitationMm": 0
      }
    ],
    "note": null,
    "checkedAt": "2026-08-09T12:00:00+09:00"
  },
  "warnings": [],
  "generatedAt": "2026-08-09T12:00:00+09:00"
}
```

### 6.1 최상위 필드

| 필드                       | 형식               | 의미                                                       |
| -------------------------- | ------------------ | ---------------------------------------------------------- |
| `travelDate`               | string(date)       | 요청에서 검증된 여행일                                     |
| `route`                    | `Route`            | 자동차 경로 요약과 지도 표시용 좌표                        |
| `congestion`               | `Congestion`       | 전체 경로의 혼잡 가능성 요약                               |
| `events`                   | `Event[]`          | 날짜 검증과 중복 제거를 통과한 행사                        |
| `nearbyEventCount`         | integer/null       | 목적지 반경·여행일 조건을 통과한 행사 후보 개수            |
| `nearbyEventCountIsCapped` | boolean            | 후보 조회 상한에 도달해 실제 개수가 더 많을 수 있는지 여부 |
| `visitorReference`         | `VisitorReference` | 과거 방문객 또는 상대 집중률 참고값                        |
| `weather`                  | `Weather`          | 여행일 예보 또는 제공 불가 상태                            |
| `warnings`                 | `Warning[]`        | 부분 실패·데이터 한계·확인 필요 안내                       |
| `generatedAt`              | string(date-time)  | 서버가 응답을 생성한 시각                                  |

현재 MVP의 `events`는 상세 조회 전까지 빈 배열을 반환한다. 행사 개수는 `nearbyEventCount`로 제공하고, `nearbyEventCountIsCapped`가 `true`이면 화면에서 “이상”으로 표시한다. `visitorReference`와 `weather`는 조회 실패 시에도 객체를 유지하고 각 객체의 `status`로 상태를 표현한다.

## 7. 응답 객체 정의

### 7.1 `Route`

| 필드              | 형식         | nullable | 의미                                      |
| ----------------- | ------------ | -------: | ----------------------------------------- |
| `origin`          | `GeoPoint`   |   아니오 | 지오코딩 또는 입력으로 확정한 출발 좌표   |
| `destination`     | `GeoPoint`   |   아니오 | 지오코딩 또는 입력으로 확정한 여행지 좌표 |
| `distanceMeters`  | integer      |   아니오 | 자동차 경로 총거리                        |
| `durationSeconds` | integer      |   아니오 | 경로 제공자가 반환한 예상 소요시간        |
| `polyline`        | `GeoPoint[]` |   아니오 | 출발지부터 목적지 순서의 지도 표시용 경로 |

`durationSeconds`는 행사로 인한 지연시간이 아니라 경로 제공자의 일반 예상시간이다.

### 7.2 `Congestion` (계약 호환용 행사 밀집 가능성)

| 필드                  | 형식              | 의미                              |
| --------------------- | ----------------- | --------------------------------- |
| `level`               | `CongestionLevel` | 목적지 주변 행사 밀집 가능성 등급 |
| `summary`             | string            | 사용자에게 보여줄 한 줄 요약      |
| `reasons`             | string[]          | 날짜, 거리, 출처 등 판정 근거     |
| `isTrafficPrediction` | boolean           | MVP에서는 항상 `false`            |

현재 행사 개수 기반 규칙:

| 행사 개수 | 값                   |
| --------: | -------------------- |
|       0~2 | `low`                |
|       3~5 | `medium`             |
|    6 이상 | `high`               |
| 확인 불가 | `needs-confirmation` |

`CongestionLevel`:

| 값                   | 의미                              |
| -------------------- | --------------------------------- |
| `high`               | 혼잡 가능성 높음                  |
| `medium`             | 혼잡 가능성 보통                  |
| `low`                | 혼잡 가능성 낮음                  |
| `needs-confirmation` | 날짜·장소·좌표가 부족해 확인 필요 |

### 7.3 `Event`

| 필드                          | 형식              | nullable | 의미                                                         |
| ----------------------------- | ----------------- | -------: | ------------------------------------------------------------ |
| `id`                          | string            |   아니오 | 현재 응답 안에서만 유효한 행사 식별자                        |
| `title`                       | string            |   아니오 | 행사명                                                       |
| `startDate`                   | string(date)      |   아니오 | 행사 시작일                                                  |
| `endDate`                     | string(date)      |   아니오 | 행사 종료일; 원본에 없으면 시작일과 동일하게 정규화          |
| `venue`                       | string            |       예 | 행사장명                                                     |
| `address`                     | string            |       예 | 행사장 주소                                                  |
| `location`                    | `GeoPoint`        |       예 | 행사장 좌표                                                  |
| `eventType`                   | enum              |   아니오 | `festival`, `performance`, `sports`, `other`                 |
| `keywords`                    | string[]          |   아니오 | 정규화된 행사 키워드                                         |
| `sourceType`                  | enum              |   아니오 | `visitkorea`, `local-gov`, `organizer`                       |
| `sourceName`                  | string            |   아니오 | 사용자에게 표시할 출처명                                     |
| `sourceUrl`                   | string(uri)       |       예 | 공식 원문 URL                                                |
| `confidence`                  | enum              |   아니오 | `high`, `medium`, `low`                                      |
| `status`                      | enum              |   아니오 | `confirmed`, `candidate`, `changed`, `cancelled`             |
| `distanceToRouteMeters`       | integer           |       예 | 이전 경로 검색 계약 호환 필드; 목적지 전용 분석에서는 `null` |
| `distanceToDestinationMeters` | integer           |       예 | 행사장과 목적지 사이 거리                                    |
| `congestionSignal`            | `CongestionLevel` |   아니오 | 행사 단위 혼잡 가능성 신호                                   |
| `checkedAt`                   | string(date-time) |   아니오 | 현재 요청에서 출처를 확인한 시각                             |

- `location`이 `null`이면 `distanceToRouteMeters`도 반드시 `null`이고 `congestionSignal`은 `needs-confirmation`이다.
- 원본 종료일이 없어 `endDate`를 시작일로 정규화한 행사는 `confidence` 또는 `status`에 불확실성을 반영한다.
- `status`가 `confirmed`인 행사는 `sourceUrl`이 반드시 존재한다.
- `cancelled` 행사는 일반 행사 목록에서 제외하는 것을 기본으로 하며, 사용자 안내가 필요할 때만 경고와 함께 포함한다.
- `id`와 `checkedAt`은 서버에 저장되지 않는다.

### 7.4 `VisitorReference`

| 필드                | 형식         | nullable | 의미                                      |
| ------------------- | ------------ | -------: | ----------------------------------------- |
| `status`            | enum         |   아니오 | `available`, `no-data`, `failed`          |
| `referenceDate`     | string(date) |       예 | 실제 참고 데이터의 기준일                 |
| `region`            | string       |       예 | 시도 또는 시군구명                        |
| `visitorCount`      | integer      |       예 | 과거 방문객 참고값                        |
| `concentrationRate` | number       |       예 | 제공자가 반환한 관광지 상대 집중률 참고값 |
| `isForecast`        | boolean      |   아니오 | 항상 `false`                              |
| `sourceName`        | string       |   아니오 | 데이터 출처명                             |
| `note`              | string       |   아니오 | 값의 성격 또는 미제공 사유                |

상태별 규칙:

- `available`: `referenceDate`와 `region`이 존재하며, `visitorCount` 또는 `concentrationRate` 중 하나 이상이 존재한다.
- `no-data`: 요청은 성공했지만 사용할 값이 없으며 수치 필드는 `null`이다.
- `failed`: 외부 조회에 실패했으며 수치 필드는 `null`이다. 원본 오류는 포함하지 않는다.

### 7.5 `Weather`

| 필드         | 형식                | nullable | 의미                                                  |
| ------------ | ------------------- | -------: | ----------------------------------------------------- |
| `status`     | enum                |   아니오 | `available`, `not-yet-published`, `no-data`, `failed` |
| `targetDate` | string(date)        |   아니오 | 요청 여행일                                           |
| `summary`    | string              |       예 | 사용자에게 표시할 예보 요약                           |
| `forecasts`  | `WeatherForecast[]` |   아니오 | 시간대별 예보                                         |
| `note`       | string              |       예 | 미발표·결과 없음·실패 안내                            |
| `checkedAt`  | string(date-time)   |   아니오 | 예보 조회 시각                                        |

`WeatherForecast`:

| 필드                              | 형식              | nullable | 의미                                                                       |
| --------------------------------- | ----------------- | -------: | -------------------------------------------------------------------------- |
| `forecastAt`                      | string(date-time) |   아니오 | 예보 대상 시각                                                             |
| `condition`                       | enum              |   아니오 | `clear`, `partly-cloudy`, `cloudy`, `rain`, `snow`, `rain-snow`, `unknown` |
| `temperatureC`                    | number            |       예 | 섭씨 기온                                                                  |
| `precipitationProbabilityPercent` | number            |       예 | 강수확률                                                                   |
| `precipitationMm`                 | number            |       예 | 강수량                                                                     |

`status`가 `available`이 아니면 `summary`는 `null`, `forecasts`는 `[]`, `note`에는 사용자용 사유를 넣는다.

### 7.6 `Warning`

```json
{
  "code": "WEATHER_NOT_YET_PUBLISHED",
  "scope": "weather",
  "severity": "info",
  "message": "여행일의 단기예보가 아직 발표되지 않았습니다.",
  "eventId": null
}
```

| 필드       | 형식         | nullable | 의미                                       |
| ---------- | ------------ | -------: | ------------------------------------------ |
| `code`     | string(enum) |   아니오 | 모바일 분기용 안정적인 코드                |
| `scope`    | enum         |   아니오 | `analysis`, `events`, `visitor`, `weather` |
| `severity` | enum         |   아니오 | `info`, `warning`                          |
| `message`  | string       |   아니오 | 사용자에게 표시 가능한 한국어 문구         |
| `eventId`  | string       |       예 | 특정 행사에 대한 경고일 때 행사 ID         |

초기 경고 코드는 다음과 같다.

| 코드                            | 의미                             |
| ------------------------------- | -------------------------------- |
| `EVENTS_PROVIDER_FAILED`        | 행사 목록 조회 실패              |
| `EVENT_DETAILS_PARTIAL_FAILURE` | 후속 행사 상세 조회 중 일부 실패 |
| `EVENT_MISSING_COORDINATES`     | 행사 좌표가 없어 거리 판정 불가  |
| `VISITOR_NO_DATA`               | 방문객 참고값 없음               |
| `VISITOR_FAILED`                | 방문객 조회 실패                 |
| `WEATHER_NOT_YET_PUBLISHED`     | 예보가 아직 발표되지 않음        |
| `WEATHER_NO_DATA`               | 발표 범위지만 사용할 예보가 없음 |
| `WEATHER_FAILED`                | 날씨 조회 실패                   |
| `ANALYSIS_LIMIT_APPLIED`        | 호출량 상한으로 일부 후보만 분석 |

## 8. 부분 성공 응답

예를 들어 날씨 API가 실패했지만 경로·행사·방문객 분석이 완료된 경우 HTTP 상태는 `200 OK`다.

```json
{
  "travelDate": "2026-10-03",
  "route": {
    "origin": {
      "lat": 37.554678,
      "lon": 126.970606
    },
    "destination": {
      "lat": 35.158698,
      "lon": 129.160384
    },
    "distanceMeters": 400000,
    "durationSeconds": 18000,
    "polyline": [
      {
        "lat": 37.554678,
        "lon": 126.970606
      },
      {
        "lat": 35.158698,
        "lon": 129.160384
      }
    ]
  },
  "congestion": {
    "level": "low",
    "summary": "목적지 주변 행사 밀집 가능성이 낮습니다.",
    "reasons": [
      "여행일과 겹치는 목적지 반경 15km 내 행사 후보가 0개 확인되었습니다.",
      "행사 상세정보와 실제 교통 지연시간은 아직 반영하지 않았습니다."
    ],
    "isTrafficPrediction": false
  },
  "events": [],
  "nearbyEventCount": 0,
  "nearbyEventCountIsCapped": false,
  "visitorReference": {
    "status": "available",
    "referenceDate": "2025-10-03",
    "region": "부산광역시 해운대구",
    "visitorCount": 32145,
    "concentrationRate": null,
    "isForecast": false,
    "sourceName": "한국관광공사",
    "note": "과거 참고값이며 여행일의 미래 방문객 수 예측이 아닙니다."
  },
  "weather": {
    "status": "failed",
    "targetDate": "2026-10-03",
    "summary": null,
    "forecasts": [],
    "note": "날씨 정보를 불러오지 못했습니다.",
    "checkedAt": "2026-08-09T12:00:00+09:00"
  },
  "warnings": [
    {
      "code": "WEATHER_FAILED",
      "scope": "weather",
      "severity": "warning",
      "message": "날씨 정보를 불러오지 못해 행사와 경로 정보만 제공했습니다.",
      "eventId": null
    }
  ],
  "generatedAt": "2026-08-09T12:00:00+09:00"
}
```

## 9. 오류 응답

모든 `4xx`, `5xx` 응답은 같은 형식을 사용한다.

```json
{
  "requestId": "8de01c48-509f-4e57-b67b-2fd13d393419",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "요청 값을 확인해 주세요.",
    "fields": [
      {
        "field": "travelDate",
        "code": "INVALID_DATE_FORMAT",
        "message": "travelDate는 YYYY-MM-DD 형식이어야 합니다."
      }
    ]
  }
}
```

### 9.1 오류 필드

| 필드               | 형식           | 의미                                  |
| ------------------ | -------------- | ------------------------------------- |
| `requestId`        | string         | 응답 헤더와 동일한 비식별 요청 ID     |
| `error.code`       | string(enum)   | 모바일 분기용 오류 코드               |
| `error.message`    | string         | 사용자에게 표시 가능한 일반 오류 문구 |
| `error.fields`     | `FieldError[]` | 입력 필드 오류 목록, 해당 없으면 `[]` |
| `fields[].field`   | string         | 잘못된 JSON 필드 경로                 |
| `fields[].code`    | string         | 세부 검증 코드                        |
| `fields[].message` | string         | 필드별 안내 문구                      |

### 9.2 HTTP 상태와 오류 코드

|  HTTP | `error.code`                       | 조건                                  |
| ----: | ---------------------------------- | ------------------------------------- |
| `400` | `INVALID_JSON`                     | JSON 문법 오류 또는 읽을 수 없는 본문 |
| `413` | `PAYLOAD_TOO_LARGE`                | 요청 본문 크기 상한 초과              |
| `415` | `UNSUPPORTED_MEDIA_TYPE`           | JSON이 아닌 Content-Type              |
| `422` | `VALIDATION_ERROR`                 | 필수값, 형식, 범위, Enum 오류         |
| `422` | `LOCATION_NOT_FOUND`               | 주소를 좌표로 확정할 수 없음          |
| `503` | `LOCATION_SUGGESTIONS_UNAVAILABLE` | 장소명 후보 제공자 미신청·장애        |
| `429` | `RATE_LIMITED`                     | 서버 또는 제공자 호출 한도 초과       |
| `502` | `ROUTE_UNAVAILABLE`                | 외부 경로 서비스 실패로 분석 불가     |
| `504` | `ANALYSIS_TIMEOUT`                 | 전체 분석 제한시간 초과               |
| `500` | `INTERNAL_ERROR`                   | 공개할 수 없는 내부 오류              |

오류 메시지에는 사용자 입력값, 좌표, 외부 API 원문 오류, API 키, 스택 트레이스를 포함하지 않는다.

## 10. Health 응답

### `GET /health`

정상 응답은 `200 OK`다.

```json
{
  "status": "ok"
}
```

외부 API 연결 상태와 환경변수 값은 노출하지 않는다.

## 11. 모바일–백엔드 동기화 기준

- FastAPI의 Pydantic 모델과 이 문서의 필드명·nullable·Enum을 동일하게 유지한다.
- 모바일 TypeScript 타입은 FastAPI OpenAPI 스키마에서 생성하는 방식을 우선한다.
- 수동 타입을 사용할 경우 예제 요청, 정상 응답, 부분 성공 응답, 오류 응답을 양쪽 테스트 Fixture로 공유한다.
- Enum을 추가할 때 기존 의미를 바꾸지 않고 새 값을 추가하며, 모바일은 알 수 없는 값을 일반 안내 상태로 처리한다.
- 필드를 제거하거나 형식을 바꾸는 호환성 파괴 변경은 `/api/v2`에서 수행한다.
- 요청·응답 본문과 예제 데이터는 애플리케이션 로그에 남기지 않는다.
- 장소 후보 계약은 `backend/app/schemas/locations.py`와 `mobile/src/api/contracts.ts`를 함께 변경한다.

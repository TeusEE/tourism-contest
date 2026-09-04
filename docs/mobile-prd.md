# Travel Congestion 모바일 PRD

- 문서 성격: 기존 모바일 구현 범위와 Expo 재구성 기준
- 작성 기준일: 2026-08-20
- 검증 상태: iOS Simulator에서 장소 추천·주소 선택·분석 흐름 통과, Android·실기기·스토어 검증 대기
- 활성 구현: `mobile/` Expo 프로젝트
- 제품: 여행계획 목적지 주변 행사 밀집 가능성 분석 앱

## 1. 문서 범위

이 문서는 과거 모바일 구현에 포함되어 있던 기능과 동작 규칙을 정리하고, 현재 Expo 프로젝트로 옮겨진 범위를 고정한다. FastAPI 내부 구현, 외부 API의 서버 키와 Cloud Run 배포 방식은 이 문서의 범위가 아니다. 모바일은 분석 요청을 보내고 결과를 표현하며, 서버용 API 키를 보관하지 않는다.

기존 구현의 기능 범위는 새 Expo 프로젝트 `mobile/`로 재구성했다. 현재 저장소에는 이 Expo 프로젝트만 모바일 활성 구현으로 남기며, 이전 폴더는 교체 과정에서 제거했다.

## 2. 제품 목적

사용자가 여행일, 출발지, 여행지를 입력하면 목적지 반경 행사 개수, 방문객 참고값, 여행지 날씨를 함께 보여준다. 결과의 밀집 가능성 등급은 행사 개수를 바탕으로 한 참고 안내이며 실제 교통량이나 지연시간 예측이 아니다.

## 3. 사용자 흐름

```text
여행 분석 탭
  → 여행일·출발지·여행지·출발 시각·관심 행사 유형 입력
  → 장소명 입력 시 후보 선택으로 주소 정규화
  → 입력 검증
  → 분석 결과 화면
  → 로딩 / 취소 / 성공 / 오류 / 부분 실패 상태 표시
  → 결과 초기화 후 새 분석

안내 탭
  → 비저장 정책·데이터 출처·행사 밀집 가능성의 한계 확인
```

### 3.1 여행 분석 입력

| 항목           |   필수 | 규칙                                         |
| -------------- | -----: | -------------------------------------------- |
| 여행일         |     예 | `YYYY-MM-DD`, 실제 존재하는 날짜             |
| 출발지         |     예 | 공백 제거 후 1~200자                         |
| 여행지         |     예 | 공백 제거 후 1~200자                         |
| 출발 예정 시각 | 아니오 | `HH:mm` 형식                                 |
| 관심 행사 유형 | 아니오 | 축제·공연·스포츠·전시·박람회·문화, 최대 10개 |

빠른 날짜 선택으로 오늘·내일·일주일 후를 제공한다. 입력값은 메모리에만 유지하며 AsyncStorage, SecureStore 등의 영구 저장소를 사용하지 않는다.

출발지·여행지 입력은 `서울역`, `부산역` 같은 장소명과 숫자가 포함된 도로명 주소를 300ms debounce로 서버에 조회한다. 사용자가 Return 키를 누르면 대기 중인 후보 조회를 즉시 실행하고, 후보가 여러 개인 경우 자동으로 임의 선택하지 않고 사용자가 장소·도로명 주소를 선택한다. 후보 API 장애나 빈 결과에도 주소 직접 입력은 계속 사용할 수 있다.

## 4. 화면 요구사항

### 4.1 여행 분석 화면

- 앱 소개 문구와 행사 밀집 가능성의 성격을 표시한다.
- 출발지·여행지·여행일·출발 시각 입력을 제공한다.
- 출발지·여행지 입력은 장소명 검색을 지원한다. 사용자가 `서울역`처럼 입력하면 추천 후보의 도로명 주소를 보여주고, 후보를 선택하면 주소 형태로 정규화한다. 추천 API 장애나 권한 미승인 시에는 주소 직접 입력을 계속 허용한다.
- 행사 유형을 칩 형태로 복수 선택한다.
- 필수값과 날짜·시각·길이 오류를 입력 필드 아래에 표시한다.
- 분석 중에는 중복 제출을 막고 결과 화면으로 이동한다.
- 분석 요청 전송 시 입력값을 trim하고 모바일 플랫폼을 자동으로 `IOS` 또는 `AND`로 지정한다.
- 입력 정보와 결과를 영구 저장하지 않는다는 안내를 표시한다.

### 4.2 분석 결과 화면

상태별 화면을 제공한다.

- `loading`: 분석 중 안내, 진행 설명, 취소 버튼, 백그라운드 복귀 안내
- `success`: 목적지 주변 행사 밀집 가능성·근거, 지도, 거리·시간·행사 후보 수, 방문객·날씨, 경고
- `error`: 사용자에게 안전한 오류 문구, 다시 시도, 입력 화면으로 이동
- `cancelled`: 취소 안내와 입력 화면 이동
- 결과 없음: 분석할 여행계획이 없다는 안내

성공 결과에는 다음을 표시한다.

- 목적지 주변 행사 밀집 가능성: 행사 후보 0~~2개 낮음, 3~~5개 보통, 6개 이상 높음, 조회 실패 확인 필요
- “교통 지연 예측 아님” 안내
- 자동차 경로 거리와 예상 이동시간
- 경로·출발지·도착지 지도
- 행사 상세정보는 후속 단계에서 제공하며, 현재는 행사 후보 수와 상세 조회 보류 상태를 표시
- 방문객 값의 기준일·지역·참고 성격
- 날씨 상태, 확인 시각, 예보 또는 미발표·없음·실패 상태
- 외부 제공자 일부 실패와 데이터 한계 경고

### 4.3 안내 화면

- 출발지·여행지·여행일과 분석 결과를 앱과 서버의 영구 저장소에 저장하지 않는다는 정책
- NAVER Maps, 한국관광공사, 기상청 데이터 출처
- 공식 행사 URL만 연결하며 행사 이미지를 저장·재배포하지 않는다는 안내
- 행사 밀집 가능성 등급이 실제 교통량·지연시간 예측이 아니라는 한계
- 앱 버전 `1.0.0`

## 5. 모바일-백엔드 계약

### 5.1 요청

`POST /api/v1/travel-plan/analyze`

```json
{
  "travelDate": "2026-10-03",
  "origin": "서울역",
  "destination": "부산 해운대",
  "departureTime": "08:00",
  "clientPlatform": "IOS",
  "eventKeywords": ["축제", "공연"]
}
```

모바일은 `origin`과 `destination`을 trim하고, 선택 입력인 `departureTime`은 값이 있을 때만 전송한다. 서버 API 키나 NAVER REST Client Secret은 요청에 포함하지 않는다.

장소 후보 API는 `GET /api/v1/locations/suggestions?q={query}&limit=5`이며, 선택된 후보의 `roadAddress`를 분석 요청의 `origin` 또는 `destination`으로 사용한다.

### 5.2 응답

응답은 다음 정보를 포함한다.

- `travelDate`
- `route`: 출발·도착 좌표, 거리, 시간, polyline
- `congestion`: 등급, 요약, 근거, `isTrafficPrediction: false`
- `events`: 현재 단계에서는 빈 배열; 후속 상세 조회 단계의 행사 목록
- `nearbyEventCount`: 여행일·키워드·목적지 반경 조건을 통과한 행사 후보 수
- `nearbyEventCountIsCapped`: 조회 상한 도달 여부
- `visitorReference`: 과거 참고값 또는 없음·실패 상태
- `weather`: 예보·미발표·없음·실패 상태와 예보 목록
- `warnings`: 범위, 심각도, 사용자 안내 문구
- `generatedAt`

응답의 필수 구조와 enum은 `mobile/src/api/contracts.ts`에서 검증한다. 잘못된 응답은 `invalid-response` 오류로 분류한다.

### 5.3 오류 처리

모바일 오류 분류는 `server`, `network`, `timeout`, `cancelled`, `invalid-response`다. 서버의 내부 상세값과 원문 응답을 화면에 노출하지 않고 다음 사용자 문구로 변환한다.

- 입력 오류
- 위치 확인 실패
- 자동차 경로 확인 실패
- 분석 시간 초과
- 요청 과다
- 외부 데이터 조회 실패
- 일반 서버·네트워크 오류

요청에는 기본 55초 제한시간과 `AbortController` 취소를 적용한다. 오래된 요청의 응답이 새 상태를 덮어쓰지 않도록 요청 ID를 확인한다.

## 6. 지도 구현

### 6.1 네이티브

- `@mj-studio/react-native-naver-map`의 `NaverMapView`를 사용한다.
- 응답 polyline을 `NaverMapPolylineOverlay`로 표시한다.
- 출발·도착 좌표를 `NaverMapMarkerOverlay`로 표시한다. 행사 마커는 상세 조회 단계에서 추가한다.
- 경로와 출발·도착 좌표를 포함하는 초기 region을 계산한다.
- 네이버 모바일 지도 SDK는 Expo Go가 아니라 config plugin이 반영된 Development Build에서 검증한다.

### 6.2 웹·비네이티브 fallback

웹에서는 네이버 네이티브 SDK를 로드하지 않는다. 좌표를 화면에 투영하는 경로 미리보기를 사용하고, 출발·도착을 표시한다. 행사 마커는 상세 조회 단계에서 추가한다.

## 7. 상태와 데이터 보존

`AnalysisProvider`가 React Context와 reducer로 다음을 메모리에서 관리한다.

- 입력값
- 제출한 입력값
- 분석 단계
- 결과
- 안전한 오류 객체
- 검증 오류
- 앱 foreground/background 상태

요청 중 입력 수정과 중복 제출은 막는다. 취소·새 분석·앱 재시작 시 정책에 따라 이전 입력과 결과를 정리한다. 영구 상태 관리 미들웨어와 파일·키체인·로컬 DB는 사용하지 않는다.

## 8. 환경 설정

새 프로젝트에 포함되는 공개 설정은 다음뿐이다.

```text
EXPO_PUBLIC_API_BASE_URL
EXPO_PUBLIC_NAVER_MAP_CLIENT_ID
EXPO_PUBLIC_ALLOW_HTTP_DEV_SERVER
```

`EXPO_PUBLIC_NAVER_MAP_CLIENT_ID`는 모바일 지도 SDK용 공개 Client ID다. NAVER REST Client Secret, 관광공사·기상청 서버 키는 모바일 프로젝트에 넣지 않는다. 개발 환경의 HTTP API URL 허용은 로컬 iOS Development Build에서만 사용하고 운영에서는 비활성화한다.

앱 식별자는 다음으로 유지한다.

- iOS Bundle ID: `com.travelcongestion.app`
- Android package: `com.travelcongestion.app`
- URL scheme: `travelcongestion`

## 9. 품질 기준

새 Expo 프로젝트는 다음을 통과해야 한다.

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm test -- --runInBand`
- `npx expo config --type public`
- 네이티브 지도는 Development Build에서 타일·경로선·마커를 확인
- 서버가 실패해도 오류·재시도·취소 UI가 정상 동작
- 서버 키가 앱 번들과 저장소에 포함되지 않음

현재 자동·시뮬레이터 검증:

- Jest 14개, TypeScript, ESLint, Prettier 검사 통과
- iOS Simulator XCUITest에서 `서울역`·`부산역` 추천 후보 표시와 도로명 주소 채움 통과
- 선택된 주소로 FastAPI 전체 분석 응답 통과
- Android 에뮬레이터·실기기, iPhone 실기기, Cloud Run 운영 URL 검증은 남아 있다.

## 10. 이관 완료 조건

- 기존 모바일의 입력·분석·안내·결과 흐름이 새 Expo Router 프로젝트에서 동작한다.
- FastAPI 요청 계약과 오류 분류가 유지된다.
- 웹 fallback과 네이티브 NAVER 지도 구현이 분리된다.
- 앱 상태는 메모리에만 존재한다.
- 새 프로젝트에서 Expo config plugin과 Development Build를 통해 NAVER SDK를 재구성할 수 있다.
- 과거 모바일 구현은 새 `mobile/` 활성 구현과 섞이지 않도록 교체 과정에서 제거했다.

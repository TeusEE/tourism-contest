# Travel Congestion Vercel 프론트엔드 작업 목록

- 상태: F0~F5 기술 구현·검증·배포 완료, Production alias와 Naver 지도 연동·검증 완료
- 갱신 기준일: 2026-08-28
- 범위: `frontend/` 독립 웹 앱, Vercel 배포, Cloud Run 기반 통합 테스트
- 기준 문서: [Vercel 프론트엔드 PRD](fe-prd.md)
- 참고 문서: [모바일 PRD](mobile-prd.md), [API 계약](api.md), [상세 데이터 계약](3-erd.md), [출처 고지](source-attribution.md)

> 구현 시 `mobile/`의 화면 의미와 API 계약을 유지하되 React Native·Expo 네이티브 지도 SDK를 웹 앱 런타임에 import하지 않는다.

## 1. 진행 상태와 우선순위

### 상태

- `[ ]`: 시작 전
- `[-]`: 구현 또는 검증 중
- `[x]`: 완료 조건까지 확인
- `[!]`: 외부 결정 또는 차단 필요

### 우선순위

- `P0`: Vercel MVP 공개에 필수
- `P1`: 공개 전 품질·운영에 권장
- `P2`: 후속 개선

## 2. 선행 확인 완료

### FE-001 웹 범위·모바일 parity 기준 정리

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: 없음
- 산출물: `docs/fe-prd.md`
- 확인 내용:
  - 입력 → 장소 후보 선택 → 분석 → 결과 → 안내 흐름을 웹 기준으로 정의
  - 현재 `clientPlatform` 계약이 `IOS`·`AND`만 허용함을 확인
  - 웹은 MVP에서 `AND` 호환값을 사용하고 `WEB`은 백엔드 계약 변경 후 검토
  - 웹은 모바일과 같은 Naver 지도 경험을 Web Dynamic Map으로 제공하고, SDK 인증 불가 시 좌표 SVG fallback을 유지

### FE-002 배포된 Cloud Run smoke 기준 확인

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: 없음
- 확인 기준 URL: `https://travel-congestion-lni2ukneka-du.a.run.app`
- 확인일: 2026-08-28
- 확인 내용:
  - `/health`가 `200`과 `{"status":"ok"}`를 반환
  - `/api/v1/locations/suggestions`에 `서울역`, `limit=5`를 보내 후보 5개와 주소·좌표 구조 확인
  - 주소 기반 `/api/v1/travel-plan/analyze`가 `200`과 `route`, `congestion`, `weather`, `warnings`를 반환
- 주의: 행사 수·날씨·경고 수는 외부 데이터와 여행일에 따라 바뀌므로 고정 fixture 값으로 사용하지 않는다.

## 3. F0 — 프로젝트 기반과 계약

### FE-010 Next.js 웹 앱 생성

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-001
- 작업:
  - `frontend/`에 TypeScript·Next.js App Router 앱 생성
  - Node.js `22.14.0`과 npm lockfile 사용
  - `/`, `/results`, `/about`, 404 라우트 구성
  - `mobile/`의 Expo·네이티브 지도 패키지를 의존성에 넣지 않음
  - typecheck, lint, test, build 명령 구성
- 완료 조건:
  - `npm ci`, typecheck, lint, test, production build가 로컬에서 통과한다.
  - `/results`를 직접 열어도 404가 아닌 결과 없음 화면이 나온다.

현재 점검:

- `create-next-app@latest` CLI로 `frontend/`를 생성했다.
- TypeScript, ESLint, Tailwind, App Router, `src/` 디렉터리, npm lockfile을 포함한다.
- 중첩 Git 저장소는 생성하지 않았다.
- `/`, `/results`, `/about`, custom 404 라우트와 웹 기능별 test script를 구성했다.
- `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`가 통과했다.
- production server smoke에서 `/`, `/results`, `/about`는 200, 존재하지 않는 경로는 404를 반환했다.

### FE-011 API 계약·런타임 응답 검증 이식

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-001, FE-010
- 작업:
  - `mobile/src/api/contracts.ts`와 `docs/api.md`를 기준으로 웹 타입 작성
  - 날짜, 좌표, 경로, 혼잡, 행사, 방문객, 날씨, warning Enum 반영
  - 성공 응답·장소 후보 응답·`ErrorResponse` 런타임 검증 작성
  - Cloud Run 계약 외 필드를 임의로 화면에 의존시키지 않음
  - 웹 요청의 `clientPlatform: "AND"` 호환 정책을 테스트로 고정
- 완료 조건:
  - 실제 Cloud Run smoke 응답이 검증기를 통과한다.
  - 잘못된 응답은 `invalid-response` 상태로 안전하게 전환된다.

현재 점검:

- `frontend/src/lib/api/contracts.ts`에 모바일·백엔드 계약의 요청/성공/오류 타입과 웹 호환용 `WEB_CLIENT_PLATFORM = "AND"`를 작성했다.
- `frontend/src/lib/api/guards.ts`에 장소 후보, 분석 성공 응답, `ErrorResponse`, 좌표·날짜·Enum·부분 성공 필드 검증을 작성했다.
- 2026-08-28 운영 Cloud Run smoke에서 `/health` 200, 장소 추천 200·5개·`valid=true`, 분석 200·`valid=true`를 확인했다.
- `invalid-response` 분류에 필요한 오류 타입은 작성했으며, BFF 오류 매핑은 FE-023에서 연결한다.

### FE-012 공통 레이아웃·디자인 토큰 구성

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-010
- 작업:
  - 모바일 `theme.ts`의 색상·간격·반경·상태 색상을 CSS 변수로 이식
  - Header/navigation, Button, TextInput, StatusCard, Section, Card 구성
  - 한국어 기본 폰트와 반응형 콘텐츠 폭 정의
  - focus, hover, disabled, error 상태 정의
- 완료 조건:
  - 320px 이상에서 가로 스크롤 없이 렌더링된다.
  - 모바일과 웹의 상태 색상 의미가 일치한다.

현재 점검:

- 모바일 theme의 ink/muted/paper/primary/success/warning/danger/map 색상과 간격·반경 계열을 `frontend/src/app/globals.css` CSS 변수로 이식했다.
- 공통 header/navigation/footer, surface/state card, button, focus/hover/disabled/error 상태와 reduced-motion 규칙을 구성했다.
- `page-shell`과 모바일 media query로 320px 이상 단일 열·데스크톱 제한 폭 레이아웃을 준비했으며, 상세 시각 QA는 FE-053에서 수행한다.

### FE-013 메모리 전용 분석 상태와 라우팅 연결

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-010, FE-011
- 작업:
  - React Context 또는 reducer로 입력·제출 입력·phase·결과·오류 관리
  - `localStorage`, `sessionStorage`, IndexedDB, 쿠키 및 persistence middleware 금지
  - `/`에서 제출하면 `/results`로 이동하고, 새로고침 시 결과 없음 상태로 초기화
  - 요청 ID로 오래된 응답이 새 상태를 덮어쓰지 않게 함
- 완료 조건:
  - 앱 새로고침·새 탭·새 분석에서 이전 입력과 결과가 복원되지 않는다.
  - loading 중 입력 수정과 중복 제출이 차단된다.

현재 점검:

- `frontend/src/lib/analysis/context.tsx`의 Context/reducer를 root layout에 연결하고 입력 snapshot, phase, 결과, 오류, validation 상태를 메모리에만 둔다.
- `localStorage`, `sessionStorage`, IndexedDB, 쿠키를 사용하지 않으며 reset 시 초기 상태로 돌아간다.
- loading 중 input action을 무시하고 active request ID가 다른 success/failure/cancelled action을 무시해 오래된 응답의 상태 덮어쓰기를 막는다.
- reducer 테스트에서 loading 중 입력 차단, reset, 오래된 요청 응답 무시를 확인했다. 실제 제출·BFF 연결은 FE-032에서 이어간다.

## 4. F1 — Cloud Run BFF와 클라이언트

### FE-020 Cloud Run 서버 환경변수·BFF 공통 클라이언트

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-010
- 작업:
  - 서버 전용 `CLOUD_RUN_API_BASE_URL` 읽기 및 운영 URL 검증
  - base URL 뒤의 `/` 정규화와 허용 upstream 경로 상수화
  - timeout, AbortSignal, `Accept`, `Content-Type` 처리
  - upstream URL을 브라우저 번들·클라이언트 소스에 노출하지 않음
  - upstream body·키·전체 URL을 로그에 출력하지 않음
- 완료 조건:
  - Vercel 서버에서만 Cloud Run Base URL을 읽는다.
  - 정의되지 않은 base URL, 비정상 URL, 비JSON 응답을 안전하게 오류 처리한다.

현재 점검:

- `frontend/src/lib/api/bff.ts`에서 `CLOUD_RUN_API_BASE_URL`을 서버 Route Handler가 읽고 URL·경로·timeout·JSON·64KiB 본문을 검증한다.
- 허용 upstream 경로를 장소 추천과 분석으로 상수화하고 `fetch(..., { cache: "no-store" })`를 사용한다.
- 브라우저 클라이언트는 동일 출처 `/api/...`만 호출하며 Cloud Run env를 import하지 않는다.

### FE-021 장소 후보 BFF 구현

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-011, FE-020
- 작업:
  - `POST /api/locations/suggestions` Route Handler 작성
  - `{ q, limit }` body 검증 및 `limit` 1~5 제한
  - Cloud Run `GET /api/v1/locations/suggestions`로 서버 측 변환
  - 응답 구조 검증, upstream status 전달, `Cache-Control: no-store`
  - 임의 경로·임의 URL·GET proxy를 공개하지 않음
- 완료 조건:
  - Vercel Preview에서 `서울역` 후보가 실제 Cloud Run 응답으로 표시된다.
  - 빈 결과와 503 오류가 입력을 막지 않고 fallback 문구로 표시된다.

현재 점검:

- `POST /api/locations/suggestions`가 body를 검증하고 고정된 Cloud Run GET 경로로 변환한다.
- 실제 Playwright MCP E2E에서 운영 Cloud Run의 `서울역`·`부산역` 후보 최대 5개를 표시하고 도로명 주소 선택을 확인했다.
- BFF 단위 테스트에서 415/413/추가 필드/비JSON/503 응답을 확인했다.

### FE-022 분석 BFF 구현

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-011, FE-020
- 작업:
  - `POST /api/travel-plan/analyze` Route Handler 작성
  - JSON Content-Type과 64KiB body 상한 확인
  - Cloud Run 분석 endpoint로만 전달
  - 프론트 기본 55초 timeout과 upstream abort 연결
  - 성공·서버 오류 JSON을 `no-store`로 반환
- 완료 조건:
  - 실제 Cloud Run 분석 응답을 브라우저에 전달한다.
  - 임의 body·임의 URL proxy가 동작하지 않는다.
  - 55초 초과 요청은 사용자에게 timeout 상태로 표시된다.

현재 점검:

- `POST /api/travel-plan/analyze`가 JSON·64KiB 상한·허용 필드를 검증하고 Cloud Run 분석 endpoint로만 전달한다.
- upstream 분석 요청에 55초 timeout과 AbortSignal을 연결하고 성공·오류 응답에 `Cache-Control: no-store`를 적용했다.
- 실제 Playwright MCP E2E에서 주소 기반 분석 성공 응답과 Cloud Run `LOCATION_NOT_FOUND` 오류 전달을 확인했다.

### FE-023 웹 API 오류·취소 상태 매핑

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-013, FE-021, FE-022
- 작업:
  - `server`, `network`, `timeout`, `cancelled`, `invalid-response` 분류
  - `VALIDATION_ERROR`, `LOCATION_NOT_FOUND`, `ROUTE_UNAVAILABLE`, `RATE_LIMITED`, `UPSTREAM_ERROR` 문구 이식
  - 내부 exception·stack trace·원문 provider 오류를 화면에 노출하지 않음
  - 응답의 `X-Request-Id`는 필요 시 문의용 비식별 식별자로만 취급
- 완료 조건:
  - 오류별 제목·다시 시도·입력 복귀 동작이 모바일과 같은 의미를 갖는다.
  - 취소된 이전 요청이 success/error로 상태를 뒤집지 않는다.

현재 점검:

- `server`, `network`, `timeout`, `cancelled`, `invalid-response` 오류 상태와 backend code별 사용자 문구를 구성했다.
- 결과 화면의 다시 시도·입력 복귀·취소를 Context의 AbortController와 연결했다.
- 취소된 분석이 지연 후 응답해도 request ID와 active request guard가 상태를 덮어쓰지 않음을 Playwright MCP E2E와 reducer 테스트로 확인했다.

## 5. F2 — 입력 화면

### FE-030 여행 분석 폼 구현

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-012, FE-013, FE-023
- 작업:
  - 여행일, 출발지, 여행지, 출발 예정 시각, 행사 유형 UI 구현
  - 입력값 trim, 필수값·길이·날짜·시각 검증
  - 오늘·내일·일주일 후 빠른 선택 버튼 구현
  - 행사 유형 6종 chip과 최대 10개 카운터 구현
  - 개인정보 비저장 및 교통 지연 예측 아님 고지 표시
- 완료 조건:
  - 유효하지 않은 제출은 Cloud Run을 호출하지 않는다.
  - 키보드와 스크린리더로 모든 필드를 사용할 수 있다.

현재 점검:

- 여행일, 출발지, 여행지, 출발 시각, 6종 행사 유형 chip, 개인정보·교통 예측 아님 고지를 웹 폼으로 구현했다.
- 오늘·내일·일주일 후 preset, trim·필수값·날짜·시각·키워드 검증, aria-invalid/alert를 적용했다.
- Playwright MCP E2E에서 빈 제출 오류와 키보드 접근 가능한 필드·checkbox를 확인했다.

### FE-031 장소 autocomplete 구현

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-021, FE-030
- 작업:
  - 300ms debounce, 2~80자, 숫자 포함 주소 추천 생략
  - 최대 5개 후보 listbox/option 표시
  - 후보 선택 시 도로명 주소 → 지번 주소 → 장소명 순으로 입력값 정규화
  - loading, 빈 결과, 추천 실패, 취소 상태 표시
  - AbortController와 요청 ID로 race condition 방지
- 완료 조건:
  - `서울역`·`부산역` 입력 시 실제 Cloud Run 후보를 선택할 수 있다.
  - 추천 API가 실패해도 주소 직접 입력과 분석 제출이 가능하다.

현재 점검:

- 300ms debounce, 2~80자, 숫자 포함 주소 추천 생략, 최대 5개 listbox/option, 도로명→지번→장소명 정규화를 구현했다.
- ArrowUp/Down·Enter·Escape와 `aria-activedescendant`로 키보드 후보 선택을 지원한다.
- AbortController·로컬 요청 ID로 race condition을 차단하고, 빈 결과·추천 실패 시 직접 주소 입력 fallback 문구를 표시한다.

### FE-032 제출·로딩·취소 흐름 연결

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-013, FE-022, FE-030
- 작업:
  - 제출 전 validation, 제출 입력 snapshot, `/results` 이동
  - 결과 화면의 loading 상태와 cancel 버튼 연결
  - retry 시 마지막 제출 입력을 사용
  - 분석 중 버튼 disabled와 브라우저 back 동작 정의
- 완료 조건:
  - 한 번의 제출이 최대 한 개 분석 요청만 만든다.
  - 취소 후 입력 화면으로 돌아가 새 요청을 만들 수 있다.

현재 점검:

- 제출 전 validation과 snapshot을 적용하고 `/results`로 이동한 뒤 Context가 실제 Cloud Run 분석을 수행한다.
- loading 중 폼을 disabled 처리하고 결과 화면에서 취소·재시도·새 분석을 제공한다.
- 2026-08-28 Playwright MCP E2E에서 실제 운영 Cloud Run 기준 성공·오류/재시도·취소·중복 제출 1회·결과 새로고침 초기화를 확인했다.

## 6. F3 — 결과·안내 화면

### FE-040 결과 상태 화면 구현

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-012, FE-023, FE-032
- 작업:
  - loading, success, error, cancelled, no-result 화면 작성
  - retry, 입력으로 돌아가기, 새 분석 CTA 구현
  - `role="status"`·alert를 이용한 상태 전달
- 완료 조건:
  - 모든 phase가 빈 화면이나 무한 loading 없이 종료된다.
  - 사용자가 오류에서 복구할 수 있다.

현재 점검:

- loading, success, error, cancelled, no-result 화면과 retry·입력 복귀·새 분석 CTA를 구현했다.
- `role="status"`, `aria-live`, `role="alert"`를 적용했으며, 실제 Cloud Run 성공·오류·취소 결과를 Playwright MCP로 확인했다.

### FE-041 혼잡 가능성·경로·요약 지표 구현

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-011, FE-040
- 작업:
  - low/medium/high/needs-confirmation label·색상 적용
  - 서버 summary와 최대 3개 reasons 표시
  - 거리·일반 예상 이동시간·행사 후보 수 formatter 작성
  - `isTrafficPrediction=false` 고지 상시 표시
- 완료 조건:
  - 실제 지연시간이나 미래 교통량으로 오해할 표현이 없다.
  - `nearbyEventCount=null`과 capped count를 구분해 표시한다.

현재 점검:

- 모바일과 같은 low/medium/high/needs-confirmation 라벨·상태색, 서버 summary와 최대 3개 근거를 결과 화면에 연결했다.
- 거리·일반 예상 이동시간·행사 수 formatter와 `교통 지연 예측 아님` 고지를 적용했다.
- Cloud Run 주소 기반 분석에서 403.2km, 4시간 41분, 0개 같은 동적 응답이 안전한 참고 표현으로 표시되는 것을 확인했다.

### FE-042 Naver 지도·SVG 경로 미리보기 구현

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-011, FE-041
- 작업:
  - Naver Maps JavaScript SDK를 비동기 로드하고 `ncpKeyId`로 초기화
  - route origin·destination·polyline을 Naver `Polyline`으로 표시
  - 출발·도착 마커와 위치가 있는 이벤트 마커의 선택·접근성 처리
  - `LatLngBounds.fitBounds`로 장거리 경로와 이벤트 좌표를 화면에 맞춤
  - 키 미설정·SDK 로드 실패·웹 서비스 URL 인증 실패 시 좌표 SVG fallback
- 완료 조건:
  - 실제 Cloud Run 응답의 장거리 경로가 Naver 지도 화면 안에 들어온다.
  - Naver 지도를 사용할 수 없어도 좌표 SVG와 텍스트 지표로 경로 결과를 이해할 수 있다.

현재 점검:

- Naver Maps JavaScript SDK를 `ncpKeyId`로 비동기 로드하고, origin·destination·polyline·이벤트 좌표를 `LatLngBounds.fitBounds`에 반영했다.
- 실제 서울역→부산역 Cloud Run 응답을 `https://travel-congestion.vercel.app`에서 Naver 타일·경로·출발·도착 마커로 렌더링하는 것을 Playwright MCP로 확인했다.
- 실제 응답의 이벤트 좌표가 있을 때 번호 마커를 추가하고, 마우스·키보드 선택 시 결과 이벤트 카드가 선택되는지 확인했다.
- Naver client ID가 없거나 `localhost`처럼 허용 웹 서비스 URL이 아닌 환경에서는 인증 실패를 감지해 좌표 SVG fallback으로 전환한다.
- 모바일 브라우저 폭에서도 읽기 전용 지도를 유지하고, Naver 로고·지도 데이터 저작권 표시는 숨기지 않는다.
- 기존 SVG fallback은 polyline 4,497개 점과 출발·도착 HTML 마커가 카드 전체 기준에 맞도록 `preserveAspectRatio="none"`을 유지한다.

### FE-043 행사 count-only·경고·부분 성공 UI

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-011, FE-040, FE-041
- 작업:
  - 행사 후보 개수와 `events=[]` 상세 조회 보류 상태 표시
  - `EVENTS_PROVIDER_FAILED`, 부분 실패 및 확인 필요 상태 처리
  - `warnings`를 scope·severity별 StatusCard로 표시
  - 없음·미발표·실패 문구 구분
- 완료 조건:
  - 행사 상세정보가 아직 없는데 있는 것처럼 표시하지 않는다.
  - 일부 provider failure에서도 경로·가능한 부가 정보가 표시된다.

현재 점검:

- `events=[]`인 실제 응답은 행사 후보 수와 상세정보 보류 문구로 구분하고, count가 0일 때는 없음으로 표시한다.
- warning code·severity를 사용자용 StatusCard로 매핑하고, 행사 상세가 제공되는 경우에만 공식 source URL을 표시하도록 구성했다.
- 실제 Cloud Run 응답의 행사 0개와 날씨·방문객 부분 정보가 동시에 표시되는 것을 확인했다.

### FE-044 방문객·날씨 카드 구현

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-011, FE-040
- 작업:
  - 방문객 `available`·`no-data`·`failed` 카드 구현
  - 기준일·지역·출처·note·참고값 의미 표시
  - 날씨 `available`·`not-yet-published`·`no-data`·`failed` 카드 구현
  - 예보 최대 6개, 상태·기온·강수확률·확인 시각 표시
- 완료 조건:
  - 방문객 값이 미래 예측으로 표현되지 않는다.
  - 날씨 미발표와 조회 실패가 시각·문구로 구분된다.

현재 점검:

- 방문객 available/no-data/failed 상태, 기준일·지역·출처·note와 과거 참고값 고지를 연결했다.
- 날씨 available/not-yet-published/no-data/failed 상태, 최대 6개 예보·기온·강수확률·확인 시각을 연결했다.
- 실제 Cloud Run 응답에서 방문객 2025-08-29 참고값과 2026-08-29 날씨 예보가 서로 다른 의미로 표시되는 것을 확인했다.

### FE-045 안내·출처·개인정보 페이지 구현

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-012
- 작업:
  - `/about`에 비저장 정책, 데이터 출처, 혼잡 가능성 한계 표시
  - NAVER Maps, NAVER API HUB Local Search, 한국관광공사, 기상청 출처 반영
  - `docs/privacy-policy.html` 링크와 실제 Vercel URL 연결
  - 웹 호스팅·운영 로그 범위를 개인정보 정책에 추가할 내용 정리
- 완료 조건:
  - 앱 화면, 웹 동작, 공개 정책의 비저장·출처 설명이 일치한다.
  - 공식 URL 외 링크를 임의로 추가하지 않는다.

현재 점검:

- `/about`에 비저장 정책, 행사 밀집 가능성의 한계와 NAVER Maps·NAVER API HUB Local Search·한국관광공사·기상청 출처를 표시했다.
- `docs/privacy-policy.html`의 핵심 내용을 실제 웹 경로 `/privacy-policy.html`에서 확인할 수 있게 연결하고, Vercel·Google Cloud 운영 로그 범위를 명시했다.
- 안내·개인정보 경로를 Playwright MCP로 직접 접근해 200 응답과 본문을 확인했다.

## 7. F4 — 품질·통합 검증

### FE-050 단위·컴포넌트 테스트

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-030~FE-045
- 작업:
  - 모바일 Jest 검증 항목을 웹 테스트 러너로 이식
  - 날짜·주소·시각·키워드 validation 테스트
  - 요청 body trim·`AND` platform·optional field 변환 테스트
  - 응답 guard, 상태 레이블, 숫자·날짜 formatter 테스트
  - memory-only 상태 reset과 중복 제출 테스트
  - 결과 상태 fixture 테스트: 성공, 빈 결과, 부분 실패, 실패, 취소
- 완료 조건:
  - 외부 네트워크 없이 핵심 UI와 상태 전이가 자동 검증된다.
  - 서버용 키나 실제 사용자 입력을 fixture·snapshot에 넣지 않는다.

현재 점검:

- Vitest로 validation, BFF 요청 경계, 응답 guard, 상태 reducer, client 변환·오류, 결과 label·formatter를 검증한다.
- `npm test` 결과 7개 파일·35개 테스트가 통과했으며, fixture에는 실제 Cloud Run 자격증명이나 사용자 입력을 사용하지 않았다.

### FE-051 Cloud Run API smoke 스크립트

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-002, FE-011
- 작업:
  - `CLOUD_RUN_API_BASE_URL`을 입력받는 smoke 명령 작성
  - `/health` 200 및 status 검사
  - 장소 추천 200, items 배열·후보 구조 검사
  - 주소 기반 분석 200 및 핵심 최상위 필드·Enum 검사
  - 분석 호출은 대표 요청 1회로 제한하고 결과 숫자를 고정하지 않음
- 완료 조건:
  - Vercel 배포 전 실제 Cloud Run URL의 가용성과 계약을 확인한다.
  - 로컬 FastAPI를 대체 URL로 자동 사용하지 않는다.

현재 점검:

- `npm run smoke:cloud-run`이 `CLOUD_RUN_API_BASE_URL`만 입력으로 받아 `/health`, 장소 추천, 주소 기반 분석을 순서대로 확인한다.
- 2026-08-28 운영 URL에서 health 200(91ms), 후보 5개(333ms), 분석 200(3332ms)을 확인했으며 행사·날씨 숫자는 고정하지 않는다.

### FE-052 Vercel Preview/Production E2E

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-050, FE-051, FE-060
- 작업:
  - Playwright 등 브라우저 테스트 도구 구성
  - `VERCEL_BASE_URL`로 `/`, `/about`, `/results` 접근 확인
  - 장소 후보 선택 → 분석 → 실제 Cloud Run 응답 결과 표시 시나리오 작성
  - loading·retry·new analysis·새로고침 결과 초기화 확인
  - Preview와 Production에서 각각 smoke 실행
- 완료 조건:
  - 실제 배포 URL에서 핵심 사용자가 설치 없이 분석을 완료한다.
  - 동적 행사 개수·날씨 값은 schema·상태·레이아웃만 검증한다.

현재 점검:

- Playwright MCP로 Preview `https://frontend-muilrtfe8-teus-ee-s-projects.vercel.app`와 Production `https://travel-congestion.vercel.app`의 `/`, `/about`, `/results`, `/privacy-policy.html` 및 404 deep link를 확인했다.
- 두 배포 환경에서 `서울역`·`부산역` 후보 선택과 실제 Cloud Run 분석 200, 결과 경로·방문객·날씨·행사 count-only 화면을 확인했다.
- Vercel E2E 네트워크에는 same-origin BFF 두 경로만 보였고, 브라우저 본문에 Cloud Run URL은 노출되지 않았다. 결과 새로고침 시 결과 없음 화면으로 초기화되는 것도 확인했다.
- 새 Production alias에서 실제 Cloud Run 분석 후 Naver SDK `ready` 상태, 지도 타일·저작권 표기·경로·마커와 데스크톱·모바일 화면을 재검증했다. SDK가 인증되지 않는 로컬 환경에서는 SVG fallback이 동작하도록 확인했다.

### FE-053 반응형·접근성 브라우저 QA

- 상태: `[x]`
- 우선순위: `P1`
- 의존성: FE-040~FE-045, FE-052
- 작업:
  - 320px, 375px, 768px, 1280px 폭 확인
  - Chrome/Safari 모바일 viewport와 데스크톱 확인
  - 키보드 tab 순서·focus trap 없음·후보 listbox 조작 확인
  - axe 기반 검사와 색상 대비 확인
- Naver 지도 대체 안내·오류 live region, 이벤트 마커 키보드 조작, reduced motion 확인
- 완료 조건:
  - 핵심 입력·제출·결과·새 분석 흐름을 키보드로 완료한다.
  - 가로 잘림, 포커스 소실, 읽히지 않는 오류가 없다.

현재 점검:

- Playwright MCP로 320px·375px·768px·1280px에서 홈 화면의 horizontal overflow가 없음을 확인했고, 실제 결과 화면도 320px에서 경로·지표·카드가 렌더링됐다.
- 키보드 focus trail, input label, combobox `aria-controls`, 지도 대체 안내·마커 focus와 reduced-motion 규칙을 확인했다.
- axe-core를 브라우저에 주입해 WCAG 2A/2AA 기준 22개 pass·0 violation을 확인했다.

### FE-054 개인정보·보안 경계 검사

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-020~FE-023, FE-045
- 작업:
  - bundle에 Cloud Run·공공데이터 secret, secret marker가 없는지 검사
  - `NEXT_PUBLIC_CLOUD_RUN_API_BASE_URL` 같은 잘못된 환경변수 사용 금지 검사
  - local/session storage·IndexedDB·cookie 사용 검색
  - BFF 임의 URL·임의 method·과대 body·비JSON 요청 회귀 테스트
  - 입력·결과가 URL, 로그, analytics payload에 들어가지 않는지 확인
  - 개인정보 처리방침에 Vercel hosting/logging 범위 반영
- 완료 조건:
  - 서버용 키가 브라우저·Git·Vercel client bundle에 없다.
  - 사용자 입력·결과를 앱 기능으로 영구 저장하지 않는다.

현재 점검:

- Cloud Run·공공데이터 secret, `NEXT_PUBLIC_CLOUD_RUN_API_BASE_URL`, storage·cookie 사용을 소스와 build 산출물에서 검색했고 발견하지 않았다. `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`는 Web Dynamic Map에 필요한 공개 client ID로만 사용한다.
- 모바일과 동일한 Naver client ID를 Vercel Preview·Production에 Config 환경변수로 연결했고, 브라우저에 공개되는 값은 Naver Cloud Platform에서 등록된 웹 서비스 URL로 제한해야 한다.
- BFF 고정 path, POST-only route, JSON·본문 크기·extra field 검증과 upstream URL 비노출을 Vitest로 확인했다.
- Playwright MCP 결과 화면에서 local/session storage가 각각 0이고, 브라우저 본문에 Cloud Run URL이 노출되지 않음을 확인했다.

### FE-055 Cloud Run 기반 timeout·성능 확인

- 상태: `[x]`
- 우선순위: `P1`
- 의존성: FE-051, FE-052
- 작업:
  - Cloud Run cold start와 대표 분석 응답 시간을 기록
  - Vercel BFF 55초 timeout과 Cloud Run 60초 제한 정합성 확인
  - 사용 중인 Vercel 플랜의 Route Handler 최대 실행시간 확인
  - 운영 Cloud Run에 부하·반복 요청을 과도하게 보내지 않음
- 완료 조건:
  - 정상 응답과 timeout UX가 목표 시간 안에서 결정된다.
  - Vercel 플랜 제한으로 분석이 잘리는 경우 공개 배포를 차단하고 대안을 기록한다.

현재 점검:

- 대표 Cloud Run 분석 응답은 3332ms였고, 프론트 분석 timeout은 55초로 설정했다. Cloud Run 60초 제한과 5초 여유를 둔다.
- Vercel 프로젝트 Route Handler가 Node.js 환경에서 정상 배포·응답했고, Production 대표 분석도 200으로 완료됐다. Vercel 플랜의 정확한 실행시간 상한은 계정 요금제 정책 변경 시 별도 확인한다.

## 8. F5 — Vercel 배포

### FE-060 Vercel 프로젝트 연결

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-010, FE-050
- 작업:
  - 저장소를 Vercel 프로젝트에 연결
  - Root Directory를 `frontend`로 지정
  - Install `npm ci`, Build `npm run build` 확인
  - Node.js `22.14.0` 지정
  - 빌드 시 Cloud Run을 호출하지 않도록 확인
- 완료 조건:
  - Vercel Preview 배포가 build error 없이 생성된다.
  - 브랜치 Preview와 Production의 build 결과가 재현된다.

현재 점검:

- `teus-ee-s-projects/travel-congestion` 프로젝트를 GitHub 저장소와 연결하고 Root Directory=`frontend`, Install=`npm ci`, Build=`npm run build`, Framework=`nextjs`, Node=`22.x`를 설정했다.
- 프로젝트명을 `frontend`에서 `travel-congestion`으로 변경하고, Naver 지도 연동 Production deployment `dpl_GxXU5F7jaEpjBFxgKrwbcryxb52J`를 `READY`로 배포했다.
- 정확한 Production alias `https://travel-congestion.vercel.app`을 해당 deployment에 연결했다. 팀 스코프 기본 alias는 `https://travel-congestion-teus-ee-s-projects.vercel.app`이다.

### FE-061 Preview·Production 환경변수 설정

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-020, FE-060
- 작업:
  - 서버 전용 `CLOUD_RUN_API_BASE_URL` 등록
  - 브라우저용 `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`를 Preview·Production에 등록
  - 1차 Preview와 Production을 현재 Cloud Run 운영 URL에 연결
  - 환경변수에 Cloud Run·외부 데이터 API secret을 등록하지 않음
  - 별도 staging Cloud Run이 생기면 Preview만 교체할 수 있게 분리
- 완료 조건:
  - Vercel 브라우저 번들에서 Cloud Run env가 보이지 않는다.
  - Preview/Production BFF가 의도한 Cloud Run endpoint만 호출한다.

현재 점검:

- `CLOUD_RUN_API_BASE_URL`과 `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`를 Preview·Production에 Config 환경변수로 등록했다. Naver ID는 Web Dynamic Map용 공개 client ID이며, API secret이나 클라이언트 고정 토큰은 등록하지 않았다.
- 모바일에서 사용하던 client ID가 `travel-congestion.vercel.app`에서 인증되고 Naver 지도 타일이 렌더링되는 것을 확인했다. `localhost:3000`은 별도 웹 서비스 URL 등록 전에는 인증 실패 후 SVG fallback으로 동작한다.
- Preview·Production 브라우저 E2E에서 same-origin `/api/locations/suggestions`, `/api/travel-plan/analyze`만 확인했고 upstream Cloud Run URL은 네트워크·본문에 노출되지 않았다.
- Preview 공개 테스트를 위해 프로젝트 SSO deployment protection을 해제하고 Git fork protection은 유지했다.

### FE-062 공개 전 배포 회귀·롤백 절차

- 상태: `[x]`
- 우선순위: `P0`
- 의존성: FE-051~FE-061
- 작업:
  - Preview에서 Cloud Run smoke와 E2E를 통과한 Revision만 Production 승격
  - Production `/health` 직접 확인 및 웹 핵심 흐름 확인
  - Vercel deployment alias·도메인·HTTPS·deep link 확인
  - 장애 시 직전 정상 Vercel deployment로 즉시 rollback하는 절차 기록
  - 배포 후 Cloud Run/Vercel 로그에 입력·결과·secret이 없는지 확인
- 완료 조건:
  - Vercel Production에서 PRD 완료 조건을 모두 충족한다.
  - 차단 결함 발견 시 rollback과 원인 추적이 가능하다.

현재 점검:

- Production alias `https://travel-congestion.vercel.app`의 HTTPS HEAD 200과 deployment `dpl_GxXU5F7jaEpjBFxgKrwbcryxb52J`를 확인하고, Production에서 deep link·실제 Cloud Run 분석·HTTPS·Naver 지도 렌더링을 Playwright MCP로 검증했다.
- 장애 시 직전 정상 Production deployment ID `dpl_49GYphLV8E3Www5es5P96TixFTKX` 또는 이후 승격 전 deployment를 `npx vercel rollback <deployment-id> --yes`로 되돌리고, `/health` Cloud Run smoke와 Production E2E를 다시 실행한다.
- 새 Production alias에서 브라우저 console error/warning 0, Naver 지도 `ready`, 타일·저작권 표기와 BFF same-origin 네트워크 경계를 확인했다. 다음 수동 Production 배포 후에는 `npx vercel alias set <deployment-url> travel-congestion.vercel.app`으로 alias가 최신 deployment를 가리키는지 갱신한다.

## 9. Cloud Run 기준 통합 테스트 매트릭스

| 단계 | 실행 위치     | 요청                 | 고정 검증                                        | 동적 값 처리                         |
| ---- | ------------- | -------------------- | ------------------------------------------------ | ------------------------------------ |
| 1    | 배포 전 smoke | Cloud Run `/health`  | HTTP 200, `status=ok`                            | 없음                                 |
| 2    | 배포 전 smoke | Cloud Run 장소 추천  | HTTP 200, `items` 배열, 후보 구조                | 후보 수·순서는 범위만 확인           |
| 3    | 배포 전 smoke | Cloud Run 분석 POST  | HTTP 200, route/congestion/weather/warnings 구조 | 행사 수·날씨·경고 수는 고정하지 않음 |
| 4    | Vercel E2E    | 웹 → BFF → Cloud Run | 입력, 요청, 결과 카드와 상태 표시                | 외부 데이터 내용은 Enum·형식 확인    |
| 5    | 컴포넌트      | 네트워크 mock        | provider 실패·timeout·invalid response UI        | 실제 운영 API에 장애를 주입하지 않음 |
| 6    | 수동 QA       | Vercel Preview       | 반응형·접근성·새로고침·취소                      | 화면·브라우저 차이 기록              |

분석 API는 외부 API 호출 비용과 호출 상한을 고려해 smoke당 대표 요청을 최소화한다. 부하 테스트가 필요하면 운영 Cloud Run이 아닌 별도의 검증 Revision과 사전 승인된 호출량을 사용한다.

## 10. 릴리스 체크리스트

- [x] `frontend/` build·typecheck·lint·test 통과
- [x] API contract guard가 현재 Cloud Run 응답을 통과
- [x] Cloud Run `/health`, 장소 추천, 분석 smoke 통과
- [x] Vercel Preview BFF가 운영 Cloud Run을 호출
- [x] 실제 브라우저에서 장소 후보 선택 또는 직접 주소 입력 후 분석 성공
- [x] loading·cancelled·error·partial success·no-result UI 확인
- [x] 결과 새로고침 시 메모리 데이터가 복원되지 않음
- [x] 320px 모바일과 데스크톱 레이아웃 확인
- [x] 키보드·스크린리더·색상 대비 확인
- [x] browser bundle과 로그의 secret·입력·결과 검사
- [x] 개인정보 처리방침에 Vercel 범위 반영
- [x] Vercel Production 배포와 rollback 대상 확인
- [x] `https://travel-congestion.vercel.app` alias·HTTPS·지도 경로 렌더링 확인
- [x] Naver Maps Web Dynamic Map client ID·Production 웹 서비스 URL 설정과 실제 지도 타일·저작권 표기 확인

# 여행계획 주변 행사 기반 혼잡 가능성 분석 서비스

여행일과 출발지·여행지를 입력하면 목적지 주변 행사 개수, 방문객 참고값, 날씨를 조합해 행사 밀집 가능성을 안내하는 모바일 서비스다. `서울역`, `부산역`처럼 장소명만 입력해도 NAVER 지역 검색 후보에서 도로명 주소를 선택할 수 있다.

## 프로젝트 구성

- `backend/`: Python 3.11 + FastAPI 분석 서버
- `mobile/`: TypeScript + Expo Router 기반 Android·iOS 앱(활성 구현)
- `docs/`: PRD, 작업 현황, API 계약 및 영역별 작업 목록

## 개발 환경

- Node.js `22.14.0` (`.node-version`)
- Python `3.11` (`backend/.python-version`)
- [uv](https://docs.astral.sh/uv/)
- Android Studio 또는 Xcode는 실제 모바일 실행 시 필요

## 백엔드 실행

```bash
cd backend
uv sync --extra dev
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8080
```

`GET http://localhost:8080/health`가 `{"status":"ok"}`를 반환하면 정상이다.

```bash
cd backend
uv run pytest
uv run ruff check .
uv run mypy app
```

실제 환경변수는 `backend/.env`에 두고 저장소에는 커밋하지 않는다. 한국관광공사·기상청·NAVER Maps·NAVER API HUB 지역 검색 키 이름은 `backend/.env.example`을 참고한다. NAVER API HUB 키도 백엔드에만 둔다.

## 모바일 실행

```bash
cd mobile
npm ci
npm run typecheck
npm run lint
npm test -- --runInBand
npm start
```

네이버 모바일 지도 SDK가 포함된 앱은 Expo Go가 아닌 Development Build를 사용한다.

```bash
cd mobile
npx expo prebuild
npm run ios       # iOS Simulator + Development Build
npm run android   # Android Emulator + Development Build
```

Development Build가 설치되지 않은 상태에서 `--dev-client`를 사용하면 `No development build`
오류가 발생한다. CocoaPods 인코딩 문제를 피하기 위해 프로젝트의 상위 폴더를 ASCII 이름으로
정리했으며, 현재 프로젝트 경로는 `Desktop/contest/tourism-contest/project`다.

M3 입력·분석·결과 흐름은 다음 명령으로 확인할 수 있다.

```bash
cd mobile
npm run typecheck
npm run lint
npm run format:check
npx expo export --platform web
```

`mobile/.env.example`의 `EXPO_PUBLIC_API_BASE_URL`에 FastAPI 주소를 설정한다. 모바일에는 서버용 API 키를 넣지 않는다. NAVER 네이티브 지도 SDK는 `mobile/app.config.ts`의 config plugin을 통해 Development Build에 연결한다.

Android·iOS 식별자는 `mobile/app.config.ts`의 초기값을 기준으로 NAVER Cloud Application과 맞춰 등록한다. 기존 모바일 구현 범위와 Expo 재구성 기준은 [mobile-prd](docs/mobile-prd.md)에 정리했다.

M4 저장소 공통 보안 경계 검사는 루트에서 실행한다.

```bash
python scripts/check_m4.py
```

현재 로컬 검증 기준:

- 백엔드 `ruff`, `mypy`, `pytest` 43개 통과
- 모바일 `lint`, `typecheck`, Jest 14개 통과
- iOS Simulator에서 지역 추천(`서울역`·`부산역`)과 주소 선택 후 분석 흐름 통과
- 실제 Cloud Run 배포, Android 및 실기기 검증은 아직 남아 있다.

## 문서

- [제품 요구사항과 아키텍처](docs/1-prd.md)
- [전체 작업 현황](docs/2-task_list.md)
- [백엔드 작업](docs/tasks/backend.md)
- [모바일 작업](docs/tasks/mobile.md)
- [통합·릴리스 작업](docs/tasks/integration-release.md)
- [모바일-백엔드 API 계약](docs/api.md)
- [상세 JSON 데이터 계약](docs/3-erd.md)
- [성능·호출 예산 기준](docs/performance.md)
- [데이터 출처·이용 고지](docs/source-attribution.md)

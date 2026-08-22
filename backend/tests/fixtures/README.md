# 외부 API Fixture 정책

- Fixture는 실제 외부 응답에서 인증키, Authorization 헤더, 사용자 입력, 좌표가 포함된 요청 URL을 제거한 샘플만 저장한다.
- 성공·빈 결과·오류 응답을 제공자별 디렉터리에 둔다.
- NAVER Local Search Fixture는 HTML 태그가 포함된 장소명과 `mapx`·`mapy`의 10⁷배 정수 좌표 형식을 검증할 수 있어야 한다.
- Fixture는 네트워크 없이 단위·통합 테스트에서 반복 사용한다.
- 새로운 Fixture를 추가할 때 `tests/test_fixtures.py`의 비밀정보 검사를 통과해야 한다.

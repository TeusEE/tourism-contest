import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "서비스 안내",
  description: "Travel Congestion의 데이터 출처와 이용 안내",
};

export default function AboutPage() {
  return (
    <div className="page-shell page-shell--narrow">
      <section className="page-heading" aria-labelledby="about-title">
        <p className="eyebrow">ABOUT THIS SERVICE</p>
        <h1 id="about-title">여행 정보는 참고용으로 안전하게 확인해요</h1>
        <p>
          Travel Congestion은 목적지 주변 행사 개수와 공공데이터를 조합해 행사
          밀집 가능성을 안내합니다.
        </p>
      </section>

      <section className="stack" aria-label="서비스 이용 안내">
        <article className="surface-card content-card">
          <h2>저장하지 않는 정보</h2>
          <p>
            입력한 출발지·여행지·여행일과 분석 결과는 앱과 분석 서버의 영구
            저장소에 저장하지 않습니다. 웹 브라우저를 새로고침하거나 닫으면 화면
            상태도 초기화됩니다.
          </p>
        </article>

        <article className="surface-card content-card">
          <h2>사용하는 출처</h2>
          <ul className="source-list">
            <li>NAVER Maps: 주소·자동차 경로 및 지도 표시 기반</li>
            <li>NAVER API HUB Local Search: 장소명 후보와 주소·좌표</li>
            <li>한국관광공사: 행사·방문객·관광지 집중률 참고값</li>
            <li>기상청: 여행지 단기예보</li>
          </ul>
        </article>

        <article className="surface-card content-card">
          <h2>행사 밀집 가능성의 의미</h2>
          <p>
            목적지 반경 내에서 여행일과 겹치는 행사 후보 개수 기반의 가능성
            등급입니다. 실제 교통량이나 지연시간을 예측하는 서비스가 아닙니다.
          </p>
          <p>
            방문객 값은 과거 참고값이며 여행일의 미래 방문객 수 예측이 아닙니다.
            데이터 제공자 일부가 응답하지 않으면 가능한 정보만 표시하고 확인
            필요 안내를 함께 제공합니다.
          </p>
        </article>

        <article className="notice-card">
          <h2>출처 및 이용 안내</h2>
          <p>
            각 데이터는 제공자의 공식 API를 확인한 시점의 참고값입니다. 행사
            이미지는 저장하거나 재배포하지 않고, 확인된 공식 행사 URL만
            연결합니다.
          </p>
          <p>
            지도·로고·공공데이터 표시와 이용 조건은 배포 환경의 제공자 약관을
            기준으로 최종 확인합니다.
          </p>
          <Link className="text-link" href="/privacy-policy.html">
            개인정보 처리방침 보기
          </Link>
        </article>
      </section>

      <div className="page-footer-note">
        <span>Travel Congestion MVP · 1.0.0</span>
        <Link className="text-link" href="/">
          여행 분석으로 돌아가기
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";

import { AnalysisForm } from "@/components/analysis-form";

export default function Home() {
  return (
    <div className="page-shell">
      <section className="hero-grid" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="eyebrow">TRAVEL CONGESTION</p>
          <h1 id="home-title">
            여행 주변의 행사와 행사 밀집 가능성을 확인해요
          </h1>
          <p className="hero-description">
            출발지와 여행일을 입력하면 목적지 주변의 행사, 방문객 참고값과
            날씨를 한 번에 확인할 수 있어요.
          </p>
          <div className="hero-note">
            <strong>참고 정보 안내</strong>
            <span>
              행사 개수 기반의 가능성 등급이며, 실제 교통량이나 지연시간을
              예측하는 서비스가 아닙니다.
            </span>
          </div>
        </div>

        <AnalysisForm />
      </section>

      <div className="home-links">
        <Link className="text-link" href="/results">
          결과 화면 상태 확인
        </Link>
        <Link className="text-link" href="/about">
          서비스 안내
        </Link>
      </div>

      <section className="info-grid" aria-label="서비스 특징">
        <article className="surface-card info-card">
          <span className="info-card__number">01</span>
          <h2>목적지 주변 행사</h2>
          <p>
            여행일과 목적지 반경 조건을 통과한 행사 후보 개수를 바탕으로
            가능성을 안내합니다.
          </p>
        </article>
        <article className="surface-card info-card">
          <span className="info-card__number">02</span>
          <h2>경로·날씨·방문객</h2>
          <p>
            자동차 경로와 함께 날씨, 과거 방문객 참고값을 한 화면에서
            확인합니다.
          </p>
        </article>
        <article className="surface-card info-card">
          <span className="info-card__number">03</span>
          <h2>데이터의 한계</h2>
          <p>
            일부 외부 데이터가 없거나 실패한 경우에도 가능한 정보와 확인 필요
            상태를 구분합니다.
          </p>
        </article>
      </section>
    </div>
  );
}

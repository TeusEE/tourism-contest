import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description: "Travel Congestion 개인정보 처리방침",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="page-shell page-shell--narrow">
      <section className="page-heading" aria-labelledby="privacy-title">
        <p className="eyebrow">TRAVEL CONGESTION</p>
        <h1 id="privacy-title">개인정보 처리방침</h1>
        <p>
          Travel Congestion은 출발지와 여행지를 바탕으로 경로, 행사 밀집 가능성,
          방문객 참고값과 날씨를 확인하는 서비스입니다.
        </p>
        <p className="page-meta">시행일·최종 수정일: 2026년 8월 23일</p>
      </section>

      <div className="notice-card">
        <h2>공개 전 확인</h2>
        <p>
          실제 공개 전 운영자명, 공개 연락처, 로그 보관기간과 외부 제공자의 최신
          약관·정책을 확인해 이 문서와 일치시켜야 합니다.
        </p>
      </div>

      <section className="stack" aria-label="개인정보 처리방침 본문">
        <article className="surface-card content-card">
          <h2>1. 처리하는 정보와 목적</h2>
          <p>
            회원가입이나 사용자 계정을 요구하지 않습니다. 입력한 출발지·여행지
            검색어, 선택 장소의 주소·좌표, 여행일, 선택적 출발 시각과 행사
            유형은 주소 후보·자동차 경로·행사·방문객 참고값·날씨를 조회하고
            결과를 표시하는 동안에만 처리합니다.
          </p>
          <p>
            입력과 분석 결과는 앱 메모리, 브라우저 화면 상태와 요청 처리 범위에
            한정하며 영구 저장하지 않습니다.
          </p>
        </article>

        <article className="surface-card content-card">
          <h2>2. 수집하지 않는 정보</h2>
          <ul className="source-list">
            <li>
              현재 위치 권한, 위치 이력, 연락처, 사진·미디어를 수집하지
              않습니다.
            </li>
            <li>
              계정, 비밀번호, 결제정보, 광고 식별자와 사용자별 여행 기록을
              만들지 않습니다.
            </li>
            <li>
              localStorage, sessionStorage, IndexedDB와 쿠키에 여행 입력·결과를
              저장하지 않습니다.
            </li>
          </ul>
        </article>

        <article className="surface-card content-card">
          <h2>3. 외부 서비스와 데이터 이용</h2>
          <ul className="source-list">
            <li>Google Cloud Run: 분석 서버와 요청 처리를 운영합니다.</li>
            <li>
              NAVER Maps·NAVER API HUB Local Search: 장소, 주소·좌표와 자동차
              경로를 조회합니다.
            </li>
            <li>
              한국관광공사 TourAPI·데이터랩: 행사 후보와 방문객 참고값을
              조회합니다.
            </li>
            <li>
              기상청 공공데이터 API: 여행지 격자 기준 단기예보를 조회합니다.
            </li>
          </ul>
          <p>
            외부 API 비밀키는 브라우저 번들에 포함하지 않고 분석 서버의 서버
            전용 환경에서 관리합니다. 외부 제공자의 최신 개인정보 처리방침과
            이용약관이 적용될 수 있습니다.
          </p>
        </article>

        <article className="surface-card content-card">
          <h2>4. 운영 로그와 보유·파기</h2>
          <p>
            장애 대응과 보안을 위해 요청 ID, HTTP 메서드·경로, 응답 상태와 처리
            시간 같은 최소 기술 로그가 Vercel·Google Cloud 운영 환경에 남을 수
            있습니다. 앱과 BFF 로그에는 요청 본문, 검색어, 좌표, 분석 결과와 API
            비밀키를 기록하지 않습니다.
          </p>
          <p>
            운영 로그의 보관기간은 실제 Vercel·Google Cloud 설정과 제공자 정책에
            따르며, 배포 전에 설정을 확인하고 필요 기간이 지나면 파기하거나
            익명화합니다. 화면의 입력과 결과는 새 분석·새로고침·종료 후 서비스
            기능에서 더 이상 사용하지 않습니다.
          </p>
        </article>

        <article className="surface-card content-card">
          <h2>5. 이용자 문의</h2>
          <p>
            개인정보 처리에 관한 문의나 열람·정정·삭제·처리정지 요청은 실제 공개
            운영자와 연락처를 확정한 뒤 해당 연락처로 접수합니다. 현재는 계정이
            없으므로 요청 ID나 이용 시각 등 확인 정보가 필요할 수 있습니다.
          </p>
          <p className="page-meta">운영자·문의처: 공개 전 실제 정보로 교체</p>
        </article>
      </section>

      <div className="page-footer-note">
        <span>공개 정책 초안 · 2026-08-23</span>
        <Link className="text-link" href="/about">
          서비스 안내로 돌아가기
        </Link>
      </div>
    </div>
  );
}

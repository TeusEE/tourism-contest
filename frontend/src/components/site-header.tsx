import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="brand" href="/" aria-label="Travel Congestion 홈">
          <span className="brand__mark" aria-hidden="true">
            TC
          </span>
          <span>
            <strong>Travel Congestion</strong>
            <small>여행 주변 참고 정보</small>
          </span>
        </Link>
        <nav className="site-nav" aria-label="주요 메뉴">
          <Link href="/">여행 분석</Link>
          <Link href="/about">안내</Link>
        </nav>
      </div>
    </header>
  );
}

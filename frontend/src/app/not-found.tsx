import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-shell page-shell--narrow">
      <section className="state-panel" aria-labelledby="not-found-title">
        <p className="eyebrow">PAGE NOT FOUND</p>
        <h1 id="not-found-title">페이지를 찾을 수 없어요</h1>
        <p>요청한 주소가 없거나 이동한 페이지입니다.</p>
        <Link className="button button--primary" href="/">
          홈으로 돌아가기
        </Link>
      </section>
    </div>
  );
}

import Link from "next/link";

export default function Home() {
  return (
    <main>
      <section className="hero">
        <h1>
          설명만 쓰면,
          <br />
          AI가 영상으로 만들어 드려요
        </h1>
        <p className="lead">편집 프로그램 없이 텍스트 프롬프트만으로 쇼츠, 상품 소개, 광고 영상을 만드세요.</p>
        <div className="row">
          {/* 로그인하지 않았으면 /generate에서 로그인 페이지로 이동한다. */}
          <Link className="button" href="/generate">
            시작하기
          </Link>
          <Link className="button secondary" href="/plans">
            요금제 보기
          </Link>
        </div>
      </section>

      <section className="steps">
        <div className="card">
          <span className="step">1</span>
          <h3>요금제 선택</h3>
          <p className="muted">카드를 등록하면 매월 자동으로 결제되고 크레딧이 지급됩니다.</p>
        </div>
        <div className="card">
          <span className="step">2</span>
          <h3>프롬프트 입력</h3>
          <p className="muted">장면, 분위기, 움직임을 설명하고 화면 비율과 길이를 고르세요.</p>
        </div>
        <div className="card">
          <span className="step">3</span>
          <h3>확인하고 다운로드</h3>
          <p className="muted">생성이 끝나면 내 영상에서 미리 보고 내려받을 수 있습니다.</p>
        </div>
      </section>
    </main>
  );
}

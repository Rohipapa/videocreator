import Link from "next/link";
import { AutoVideo } from "./components/AutoVideo";
import { HeroDemo } from "./components/HeroDemo";

// 영상 출처는 README의 "영상 출처" 참고 (Mixkit Free License, Pixabay Content License).
const GALLERY: { src: string; ratio: "16x9" | "9x16" | "1x1"; prompt: string; meta: string }[] = [
  { src: "/videos/gallery-jet.mp4", ratio: "16x9", prompt: "푸른 하늘을 가르며 선회하는 전투기", meta: "16:9 · 10초" },
  { src: "/videos/gallery-collies.mp4", ratio: "9x16", prompt: "공원에서 뛰어노는 보더콜리 무리, 쇼츠용", meta: "9:16 · 5초" },
  { src: "/videos/gallery-alps.mp4", ratio: "1x1", prompt: "구름이 걸린 알프스 설산, 피드용", meta: "1:1 · 5초" },
  { src: "/videos/gallery-redcar.mp4", ratio: "16x9", prompt: "햇살을 받으며 달리는 빨간 스포츠카", meta: "16:9 · 5초" },
  { src: "/videos/gallery-cliff.mp4", ratio: "9x16", prompt: "절벽에 부서지는 파도를 내려다보는 항공 샷, 릴스용", meta: "9:16 · 10초" },
  { src: "/videos/gallery-canyon.mp4", ratio: "1x1", prompt: "초록 숲으로 덮인 거대한 협곡 위를 비행", meta: "1:1 · 10초" },
];

const FEATURES = [
  { icon: "▭", title: "화면 비율 3종", body: "유튜브 16:9, 쇼츠·릴스 9:16, 피드 1:1까지 한 번에 맞춰 생성합니다." },
  { icon: "◷", title: "진행 상황 실시간 표시", body: "대기 · 생성 중 · 완료 상태를 보여 주고, 창을 닫아도 작업은 계속됩니다." },
  { icon: "✦", title: "크레딧 자동 복구", body: "시스템 오류로 생성에 실패하면 사용한 크레딧을 자동으로 돌려드립니다." },
  { icon: "⛨", title: "안전한 자동결제", body: "카드 정보는 토스페이먼츠 결제창에서만 입력되고 서비스에 저장되지 않습니다." },
];

function PlayMark() {
  return (
    <svg viewBox="0 0 10 12" aria-hidden="true">
      <path d="M0 0 L10 6 L0 12 Z" />
    </svg>
  );
}

export default function Home() {
  const loop = [...GALLERY, ...GALLERY]; // 끊김 없이 흐르도록 두 번 이어 붙인다.
  return (
    <main className="landing">
      {/* 히어로 */}
      <section className="section hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="dot">✦</span>
            텍스트로 만드는 AI 영상 생성기
          </span>
          <h1 className="hero-title">
            글로 쓰면,
            <br />
            <span className="grad-text">영상이 됩니다.</span>
          </h1>
          <p className="hero-lead">
            장면과 분위기를 한 줄로 설명하세요. 촬영도 편집 프로그램도 없이, AI가 몇 분 만에 쇼츠·광고·상품 소개 영상을 만들어 드립니다.
          </p>
        </div>

        <div className="hero-demo">
          <HeroDemo />
        </div>

        <div className="hero-cta">

          {/* 로그인하지 않았으면 /generate에서 로그인 페이지로 이동한다. */}
          <Link href="/generate" className="prompt-bar" aria-label="영상 만들기 시작">
            <span className="spark" aria-hidden="true">
              ✦
            </span>
            <span className="ph">만들고 싶은 장면을 설명해 보세요…</span>
            <span className="button">
              영상 생성
              <span aria-hidden="true">→</span>
            </span>
          </Link>
          <div className="option-chips" aria-label="지원 옵션">
            <span>16:9 가로</span>
            <span>9:16 쇼츠</span>
            <span>1:1 피드</span>
            <span>5초 · 10초</span>
          </div>

          <div className="hero-stats">
            <div>
              <strong>3단계</strong>
              <span>입력 → 생성 → 다운로드</span>
            </div>
            <div>
              <strong>9,900원~</strong>
              <span>월 구독, 언제든 해지</span>
            </div>
            <div>
              <strong>0원</strong>
              <span>실패한 생성의 크레딧</span>
            </div>
          </div>
        </div>
      </section>

      {/* 갤러리 */}
      <section aria-labelledby="gallery-title">
        <div className="section-head" style={{ marginBottom: 24 }}>
          <span className="kicker grad-text">Gallery</span>
          <h2 id="gallery-title">프롬프트 한 줄이 만든 장면들</h2>
          <p>가로 영상부터 세로 쇼츠까지, 원하는 비율로 바로 만들 수 있어요.</p>
        </div>
        <div className="marquee-wrap">
          <div className="marquee">
            {loop.map((g, i) => (
              <figure key={i} className={`clip r-${g.ratio}`} aria-hidden={i >= GALLERY.length}>
                <AutoVideo src={g.src} />
                <span className="chip chip-meta">{g.meta}</span>
                <figcaption>
                  “{g.prompt}”<small>예시 영상</small>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* 사용 방법 */}
      <section className="section" aria-labelledby="how-title">
        <div className="section-head">
          <span className="kicker grad-text">How it works</span>
          <h2 id="how-title">세 단계면 영상이 완성돼요</h2>
          <p>편집 기술이 없어도 괜찮아요. 설명만 잘 쓰면 나머지는 AI가 합니다.</p>
        </div>
        <div className="steps">
          <div className="step-card">
            <span className="step-num grad-text">01</span>
            <h3>장면을 글로 설명</h3>
            <p>인물, 배경, 분위기, 카메라 움직임을 자연스럽게 적어 주세요.</p>
            <div className="step-visual">
              <p className="mini-prompt">
                <span className="spark">✦ </span>
                <b>안개 낀 숲 사이로 쏟아지는 아침 햇살</b>, 드론으로 천천히 전진
                <span className="caret" aria-hidden="true" />
              </p>
            </div>
          </div>
          <div className="step-card">
            <span className="step-num grad-text">02</span>
            <h3>비율과 길이 선택</h3>
            <p>올릴 곳에 맞춰 화면 비율과 길이를 고르면 필요한 크레딧이 바로 보여요.</p>
            <div className="step-visual">
              <div className="mini-options">
                <span>16:9</span>
                <span className="on">9:16</span>
                <span>1:1</span>
                <span className="on">5초</span>
                <span>10초</span>
                <span>· 10 크레딧</span>
              </div>
            </div>
          </div>
          <div className="step-card">
            <span className="step-num grad-text">03</span>
            <h3>확인하고 다운로드</h3>
            <p>생성이 끝나면 내 영상에서 바로 재생하고 내려받을 수 있어요.</p>
            <div className="step-visual">
              <AutoVideo src="/videos/gallery-canyon.mp4" />
            </div>
          </div>
        </div>
      </section>

      {/* 기능 */}
      <section className="section" style={{ paddingTop: 0 }} aria-labelledby="feat-title">
        <div className="section-head">
          <span className="kicker grad-text">Features</span>
          <h2 id="feat-title">만드는 일에만 집중하세요</h2>
        </div>
        <div className="features">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature">
              <span className="feature-icon" aria-hidden="true">
                {f.icon}
              </span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 마무리 CTA */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="cta-band">
          <h2>첫 영상을 지금 만들어 보세요</h2>
          <p>월 9,900원부터. 카드 등록 한 번이면 매달 크레딧이 자동으로 충전됩니다.</p>
          <div className="row">
            <Link className="button large" href="/generate">
              <PlayMark />
              영상 만들기
            </Link>
            <Link className="button large secondary" href="/plans">
              요금제 보기
            </Link>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <span>© 2026 AI 비디오 스튜디오</span>
        <span>예시 영상: Mixkit · Pixabay 무료 라이선스 영상 · 결제는 토스페이먼츠를 통해 안전하게 처리됩니다.</span>
      </footer>
    </main>
  );
}

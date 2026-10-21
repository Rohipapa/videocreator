import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT, GRAD } from "./theme";

// 30fps 기준 장면 배치(합계 29.2초). 배경음악은 150BPM이라 1박 = 12프레임, 1마디 = 48프레임이다.
// 첫 장면의 "생성하기" 클릭(156프레임)에 드롭이 오도록 맞추고, 이후 장면 경계는 모두 마디 시작에 둔다.
const BEAT = 12;
const BAR = BEAT * 4;
const INTRO = 90;
const SCENES = [
  { src: "clips/landscape.mp4", prompt: "눈 덮인 바위산 위를 나는 드론 샷", startFrom: 30, duration: 162, slow: true },
  { src: "clips/dog.mp4", prompt: "잔디밭을 달려오는 보더콜리, 슬로모션", startFrom: 15, duration: BAR * 3 },
  { src: "clips/car.mp4", prompt: "햇살 가득한 시골길을 달리는 스포츠카", startFrom: 360, duration: BAR * 3 },
  { src: "clips/jet.mp4", prompt: "붉은 구름을 가르는 전투기, 시네마틱", startFrom: 10, duration: BAR * 3 },
] as const;
const MONTAGE = BAR * 2;
const OUTRO = BAR * 2;

// 배경음악: Mixkit "Can't Get You Off My Mind"(Michael Ramir C.). 원곡 25.6초의 드롭을 DROP 프레임에 맞춘다.
const MUSIC = "music/cant-get-you-off-my-mind.mp3";
const DROP = INTRO + 66;
const MUSIC_DROP_SEC = 25.6;

const sceneStarts = SCENES.reduce<number[]>((acc, s, i) => [...acc, i === 0 ? INTRO : acc[i - 1] + SCENES[i - 1].duration], []);
const MONTAGE_START = sceneStarts[sceneStarts.length - 1] + SCENES[SCENES.length - 1].duration;
const OUTRO_START = MONTAGE_START + MONTAGE;
export const PROMO_DURATION = OUTRO_START + OUTRO;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.22, 1, 0.36, 1);

export const Promo = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT, color: C.text }}>
      <Audio
        src={staticFile(MUSIC)}
        trimBefore={Math.round(MUSIC_DROP_SEC * 30) - DROP}
        volume={(f) =>
          interpolate(f, [0, 12, PROMO_DURATION - 40, PROMO_DURATION - 1], [0, 0.9, 0.9, 0], clamp)
        }
      />
      <Backdrop />
      <Sequence durationInFrames={INTRO}>
        <Intro />
      </Sequence>
      {SCENES.map((s, i) => (
        <Sequence key={s.src} from={sceneStarts[i]} durationInFrames={s.duration}>
          <GenScene {...s} />
        </Sequence>
      ))}
      <Sequence from={MONTAGE_START} durationInFrames={MONTAGE}>
        <Montage />
      </Sequence>
      <Sequence from={OUTRO_START} durationInFrames={OUTRO}>
        <Outro />
      </Sequence>
      {[...sceneStarts, MONTAGE_START, OUTRO_START].map((at) => (
        <Sequence key={at} from={at - 7} durationInFrames={14}>
          <Wipe />
        </Sequence>
      ))}
      {/* 드롭 순간의 섬광 */}
      <Sequence from={DROP} durationInFrames={10}>
        <Flash />
      </Sequence>
      {/* 스톡 영상을 AI 생성물로 오인하지 않도록 예시 영상임을 표기한다 */}
      {frame >= INTRO && frame < OUTRO_START && (
        <div
          style={{
            position: "absolute",
            right: 36,
            top: 30,
            fontSize: 19,
            padding: "7px 14px",
            borderRadius: 999,
            background: "rgba(8,8,12,0.55)",
            color: "rgba(245,245,250,0.8)",
            letterSpacing: "-0.01em",
          }}
        >
          화면 속 영상은 예시용 스톡 영상입니다 (Mixkit · Pexels · Pixabay)
        </div>
      )}
    </AbsoluteFill>
  );
};

/* ── 공통 ─────────────────────────────────────────── */

const Backdrop = () => {
  const f = useCurrentFrame();
  const blob = (color: string, x: number, y: number, size: number): CSSProperties => ({
    position: "absolute",
    left: x - size / 2,
    top: y - size / 2,
    width: size,
    height: size,
    borderRadius: "50%",
    background: `radial-gradient(circle, ${color} 0%, transparent 65%)`,
    opacity: 0.38,
  });
  return (
    <AbsoluteFill>
      <div style={blob(C.red, 420 + Math.sin(f / 40) * 120, 260 + Math.cos(f / 50) * 60, 1100)} />
      <div style={blob(C.violet, 1500 + Math.cos(f / 45) * 140, 820 + Math.sin(f / 35) * 80, 1200)} />
      <div style={blob(C.blue, 1100 + Math.sin(f / 60) * 200, 150, 900)} />
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
    </AbsoluteFill>
  );
};

/** 장면 경계에서 그라디언트 띠가 화면을 훑고 지나간다. */
const Wipe = () => {
  const f = useCurrentFrame();
  const x = interpolate(f, [0, 13], [-130, 130], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  return (
    <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: -200,
          bottom: -200,
          left: `${x}%`,
          width: "120%",
          marginLeft: "-60%",
          transform: "skewX(-18deg)",
          background: `linear-gradient(90deg, transparent 0%, ${C.red} 18%, ${C.magenta} 38%, ${C.violet} 58%, ${C.blue} 80%, transparent 100%)`,
          boxShadow: `0 0 120px ${C.violet}`,
        }}
      />
    </AbsoluteFill>
  );
};

const Flash = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: GRAD,
        mixBlendMode: "screen",
        opacity: interpolate(f, [0, 10], [0.55, 0], { ...clamp, easing: Easing.out(Easing.quad) }),
        pointerEvents: "none",
      }}
    />
  );
};

const GradText = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <span
    style={{
      backgroundImage: GRAD,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      ...style,
    }}
  >
    {children}
  </span>
);

/** 글자마다 아래에서 떠오르며 초점이 맞는 텍스트 */
const RiseText = ({ text, delay, grad, step = 2 }: { text: string; delay: number; grad?: boolean; step?: number }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <span style={{ display: "inline-block", whiteSpace: "pre" }}>
      {[...text].map((ch, i) => {
        const p = spring({ frame: f - delay - i * step, fps, config: { damping: 18, stiffness: 120 } });
        const style: CSSProperties = {
          display: "inline-block",
          opacity: p,
          transform: `translateY(${(1 - p) * 40}px)`,
          filter: `blur(${(1 - p) * 14}px)`,
        };
        return grad ? (
          <GradText key={i} style={style}>
            {ch}
          </GradText>
        ) : (
          <span key={i} style={style}>
            {ch}
          </span>
        );
      })}
    </span>
  );
};

const Logo = ({ size }: { size: number }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.28,
      background: GRAD,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: `0 0 ${size * 0.6}px rgba(139,92,255,0.55)`,
    }}
  >
    <div
      style={{
        width: 0,
        height: 0,
        marginLeft: size * 0.08,
        borderTop: `${size * 0.2}px solid transparent`,
        borderBottom: `${size * 0.2}px solid transparent`,
        borderLeft: `${size * 0.32}px solid white`,
      }}
    />
  </div>
);

/* ── 1. 인트로 ─────────────────────────────────────── */

const Intro = () => {
  const f = useCurrentFrame();
  const out = interpolate(f, [72, 90], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        opacity: 1 - out,
        transform: `scale(${1 + out * 0.15})`,
        filter: `blur(${out * 10}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 44, opacity: interpolate(f, [0, 15], [0, 1], clamp) }}>
        <Logo size={52} />
        <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em" }}>AI 비디오 스튜디오</span>
      </div>
      <div style={{ fontSize: 104, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1.18, textAlign: "center" }}>
        <div>
          <RiseText text="머릿속에 그린 장면," delay={6} />
        </div>
        <div>
          <RiseText text="글로 쓰면 " delay={30} />
          <RiseText text="영상이 됩니다" delay={44} grad />
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ── 2. 프롬프트 → 생성 → 재생 ─────────────────────── */

type SceneProps = { src: string; prompt: string; startFrom: number; duration: number; slow?: boolean };

const GenScene = ({ src, prompt, startFrom, duration, slow }: SceneProps) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 첫 장면은 천천히 보여 주고(클릭 = 드롭), 이후는 마디 시작 + 3박에 클릭한다.
  const t = slow
    ? { typeStart: 10, typeEnd: 56, click: DROP - INTRO, revealStart: 70, revealEnd: 96, expandEnd: 112 }
    : { typeStart: 6, typeEnd: 32, click: BEAT * 3, revealStart: 40, revealEnd: 64, expandEnd: 80 };

  const chars = [...prompt];
  const typed = Math.round(interpolate(f, [t.typeStart, t.typeEnd], [0, chars.length], clamp));
  const caretOn = f < t.click && (f <= t.typeEnd || Math.floor(f / 8) % 2 === 0);
  const press = interpolate(f, [t.click - 3, t.click, t.click + 5], [1, 0.9, 1], clamp);

  // 카드: 화면 가운데 → 영상 아래쪽 캡션 자리로 이동
  const dock = spring({ frame: f - t.click - 2, fps, config: { damping: 20, stiffness: 90 } });
  const cardIn = spring({ frame: f, fps, config: { damping: 16, stiffness: 140 } });
  const cardY = interpolate(dock, [0, 1], [0, 400]);
  const cardScale = interpolate(dock, [0, 1], [1, 0.66]) * interpolate(cardIn, [0, 1], [0.92, 1]);

  // 영상 프레임: 가운데 작은 창 → 전체 화면
  const appear = spring({ frame: f - t.click, fps, config: { damping: 18, stiffness: 110 } });
  const expand = interpolate(f, [t.revealEnd - 4, t.expandEnd], [0, 1], { ...clamp, easing: ease });
  const w = interpolate(expand, [0, 1], [1240, 1920]);
  const h = (w * 9) / 16;
  const top = interpolate(expand, [0, 1], [(1080 - 698) / 2 - 70, 0]);
  const radius = interpolate(expand, [0, 1], [28, 0]);
  const reveal = interpolate(f, [t.revealStart, t.revealEnd], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const zoom = interpolate(f, [t.click, duration], [1.12, 1.0], { ...clamp, easing: Easing.out(Easing.quad) });
  const out = interpolate(f, [duration - 6, duration], [0, 1], clamp);

  const percent = Math.min(100, Math.round(reveal * 100));
  const video = (
    <OffthreadVideo
      src={staticFile(src)}
      startFrom={startFrom}
      muted
      style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }}
    />
  );

  return (
    <AbsoluteFill style={{ opacity: 1 - out * 0.4 }}>
      {/* 영상 창 */}
      {f >= t.click && (
        <div
          style={{
            position: "absolute",
            left: (1920 - w) / 2,
            top,
            width: w,
            height: h,
            borderRadius: radius,
            overflow: "hidden",
            opacity: appear,
            transform: `scale(${interpolate(appear, [0, 1], [0.85, 1])})`,
            boxShadow: expand < 1 ? "0 40px 120px -20px rgba(139,92,255,0.6), 0 0 0 1.5px rgba(255,255,255,0.12)" : "none",
            background: C.surface,
          }}
        >
          <Sequence from={t.click} layout="none">
            {/* 생성 전: 흐릿한 상태 */}
            <AbsoluteFill style={{ filter: `blur(${40 - reveal * 30}px) saturate(${0.3 + reveal * 0.7})`, transform: "scale(1.1)" }}>
              {video}
            </AbsoluteFill>
            {/* 위에서부터 선명하게 드러나는 부분 */}
            <AbsoluteFill style={{ clipPath: `inset(0 0 ${(1 - reveal) * 100}% 0)` }}>{video}</AbsoluteFill>
          </Sequence>
          {/* 생성 중 반짝임 */}
          <AbsoluteFill
            style={{
              background: `linear-gradient(110deg, transparent 30%, rgba(230,60,255,0.35) 45%, rgba(61,123,255,0.35) 55%, transparent 70%)`,
              backgroundSize: "250% 100%",
              backgroundPosition: `${100 - ((f * 4) % 250)}% 0`,
              opacity: 1 - reveal,
              mixBlendMode: "screen",
            }}
          />
          {/* 스캔 라인 */}
          {reveal > 0 && reveal < 1 && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: `calc(${reveal * 100}% - 3px)`,
                height: 6,
                background: GRAD,
                boxShadow: `0 0 40px 10px rgba(230,60,255,0.7)`,
              }}
            />
          )}
          {/* 진행률 */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              padding: "16px 30px",
              borderRadius: 999,
              background: "rgba(8,8,12,0.6)",
              border: "1px solid rgba(255,255,255,0.15)",
              backdropFilter: "blur(10px)",
              fontSize: 30,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 14,
              opacity: interpolate(f, [t.click + 2, t.click + 8, t.revealEnd - 6, t.revealEnd], [0, 1, 1, 0], clamp),
            }}
          >
            <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 7, background: C.magenta, boxShadow: `0 0 16px ${C.magenta}` }} />
            영상 생성 중 <GradText style={{ fontWeight: 800, minWidth: 80 }}>{percent}%</GradText>
          </div>
          {/* 완성 표시 */}
          <div
            style={{
              position: "absolute",
              left: 48,
              top: 40,
              padding: "12px 22px",
              borderRadius: 999,
              background: "rgba(8,8,12,0.55)",
              border: "1px solid rgba(255,255,255,0.18)",
              backdropFilter: "blur(10px)",
              fontSize: 24,
              fontWeight: 700,
              display: "flex",
              gap: 10,
              alignItems: "center",
              opacity: interpolate(f, [t.expandEnd - 4, t.expandEnd + 6], [0, 1], clamp),
              transform: `translateY(${interpolate(f, [t.expandEnd - 4, t.expandEnd + 6], [-12, 0], clamp)}px)`,
            }}
          >
            <GradText>✦</GradText> 완성 · 16:9
          </div>
        </div>
      )}

      {/* 프롬프트 카드 */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            transform: `translateY(${cardY}px) scale(${cardScale})`,
            opacity: cardIn,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontSize: 30,
              color: C.muted,
              fontWeight: 600,
              marginBottom: 22,
              opacity: 1 - dock,
              letterSpacing: "-0.01em",
            }}
          >
            어떤 영상을 만들어 볼까요?
          </div>
          <div
            style={{
              padding: 2,
              borderRadius: 30,
              background: GRAD,
              boxShadow: `0 30px 90px -20px rgba(139,92,255,${0.75 - dock * 0.3}), 0 0 60px rgba(255,46,99,0.25)`,
            }}
          >
            <div
              style={{
                width: 1240,
                height: 128,
                borderRadius: 28,
                background: "rgba(14,14,20,0.92)",
                display: "flex",
                alignItems: "center",
                padding: "0 22px 0 36px",
                gap: 20,
              }}
            >
              <GradText style={{ fontSize: 40 }}>✦</GradText>
              <div style={{ flex: 1, fontSize: 42, fontWeight: 600, letterSpacing: "-0.03em", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
                {typed === 0 && f < t.typeStart + 2 ? (
                  <span style={{ color: C.subtle }}>만들고 싶은 장면을 글로 적어 보세요</span>
                ) : (
                  <span>{chars.slice(0, typed).join("")}</span>
                )}
                <span
                  style={{
                    display: "inline-block",
                    width: 4,
                    height: 50,
                    marginLeft: 4,
                    borderRadius: 2,
                    background: GRAD,
                    opacity: caretOn ? 1 : 0,
                  }}
                />
              </div>
              <div
                style={{
                  height: 88,
                  padding: "0 34px",
                  borderRadius: 20,
                  background: f >= t.click ? "rgba(255,255,255,0.1)" : GRAD,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 30,
                  fontWeight: 700,
                  transform: `scale(${press})`,
                  boxShadow: f >= t.click - 6 && f < t.click + 6 ? `0 0 40px ${C.magenta}` : "none",
                }}
              >
                {f >= t.revealEnd ? "✓ 완성" : f >= t.click ? "생성 중…" : "생성하기 →"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 24, opacity: 1 - dock }}>
            {["16:9 유튜브", "10초", "시네마틱"].map((c) => (
              <span
                key={c}
                style={{
                  fontSize: 24,
                  padding: "10px 22px",
                  borderRadius: 999,
                  border: `1px solid ${C.border}`,
                  background: "rgba(20,20,28,0.7)",
                  color: C.muted,
                  fontWeight: 600,
                }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ── 3. 몽타주: 화면 비율 ─────────────────────────── */

const Montage = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const labels = ["드론 풍경", "반려견", "스포츠카", "전투기"];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 40 }}>
      <div style={{ fontSize: 66, fontWeight: 800, letterSpacing: "-0.04em" }}>
        <RiseText text="문장 한 줄로, " delay={2} step={1} />
        <RiseText text="어떤 장면이든" delay={12} step={1} grad />
      </div>
      <div style={{ display: "flex", gap: 26 }}>
        {SCENES.map((s, i) => {
          const p = spring({ frame: f - i * BEAT, fps, config: { damping: 16, stiffness: 130 } });
          return (
            <div
              key={s.src}
              style={{
                width: 320,
                height: 568,
                borderRadius: 26,
                overflow: "hidden",
                position: "relative",
                opacity: p,
                transform: `translateY(${(1 - p) * 80}px) scale(${0.9 + p * 0.1})`,
                boxShadow: "0 30px 80px -20px rgba(0,0,0,0.8), 0 0 0 1.5px rgba(255,255,255,0.14)",
              }}
            >
              <OffthreadVideo src={staticFile(s.src)} startFrom={s.startFrom + 90} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div
                style={{
                  position: "absolute",
                  left: 16,
                  bottom: 16,
                  padding: "8px 16px",
                  borderRadius: 999,
                  background: "rgba(8,8,12,0.6)",
                  backdropFilter: "blur(8px)",
                  fontSize: 22,
                  fontWeight: 700,
                }}
              >
                {labels[i]}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 14, opacity: interpolate(f, [BEAT * 4, BEAT * 5], [0, 1], clamp) }}>
        {["16:9 유튜브", "9:16 쇼츠·릴스", "1:1 피드"].map((c) => (
          <span
            key={c}
            style={{
              fontSize: 26,
              padding: "10px 24px",
              borderRadius: 999,
              border: "1.5px solid rgba(255,255,255,0.18)",
              background: "rgba(20,20,28,0.75)",
              fontWeight: 600,
            }}
          >
            {c}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/* ── 4. 엔딩 ──────────────────────────────────────── */

const Outro = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame: f - 4, fps, config: { damping: 12, stiffness: 120 } });
  const cta = spring({ frame: f - 30, fps, config: { damping: 14, stiffness: 120 } });
  const shine = interpolate(f, [40, 70], [-30, 130], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at center, rgba(139,92,255,0.35) 0%, transparent 60%)",
          opacity: interpolate(f, [0, 30], [0, 1], clamp),
        }}
      />
      <div style={{ transform: `scale(${logo})`, opacity: logo, marginBottom: 34 }}>
        <Logo size={128} />
      </div>
      <div style={{ fontSize: 92, fontWeight: 800, letterSpacing: "-0.045em" }}>
        <RiseText text="AI 비디오 스튜디오" delay={10} step={1} />
      </div>
      <div style={{ fontSize: 38, fontWeight: 600, color: C.muted, marginTop: 14, letterSpacing: "-0.02em" }}>
        <RiseText text="글로 쓰면 영상이 되는 AI 영상 생성기" delay={20} step={1} />
      </div>
      <div
        style={{
          marginTop: 56,
          display: "flex",
          alignItems: "center",
          gap: 26,
          opacity: cta,
          transform: `translateY(${(1 - cta) * 30}px)`,
        }}
      >
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            padding: "26px 56px",
            borderRadius: 999,
            background: GRAD,
            fontSize: 38,
            fontWeight: 800,
            boxShadow: "0 20px 70px -10px rgba(230,60,255,0.7)",
          }}
        >
          지금 시작하기 →
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${shine}%`,
              width: 90,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
              transform: "skewX(-20deg)",
            }}
          />
        </div>
        <div style={{ fontSize: 34, fontWeight: 700, color: C.text }}>
          월 <GradText style={{ fontWeight: 800 }}>9,900원</GradText>부터
        </div>
      </div>
      <div style={{ marginTop: 40, fontSize: 30, color: C.muted, fontWeight: 600, opacity: cta, letterSpacing: "0.01em" }}>
        videocreator-tau.vercel.app
      </div>
    </AbsoluteFill>
  );
};

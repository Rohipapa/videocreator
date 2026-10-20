"use client";

import { useEffect, useRef, useState } from "react";

// 첫 화면 데모: 프롬프트가 입력되고 → 생성되고 → 영상이 재생되는 과정을 반복해서 보여준다.
// 영상 출처는 README의 "영상 출처" 참고 (Mixkit Free License, Pixabay Content License).
const DEMOS = [
  { prompt: "눈 덮인 거대한 바위산 위를 천천히 날아가는 항공 촬영, 시네마틱", src: "/videos/hero-landscape.mp4", meta: "16:9 · 10초" },
  { prompt: "들판을 가로질러 카메라를 향해 전력 질주하는 보더콜리, 슬로모션", src: "/videos/hero-dog.mp4", meta: "16:9 · 5초" },
  { prompt: "굽이진 산길을 달리는 빨간 스포츠카, 드론 추적 촬영", src: "/videos/hero-car.mp4", meta: "16:9 · 10초" },
  { prompt: "노을빛 구름 위를 비행하는 전투기, 웅장한 공중 촬영", src: "/videos/hero-jet.mp4", meta: "16:9 · 5초" },
];

const PLAY_MS = 6000;

type Phase = "typing" | "rendering" | "playing";

export function HeroDemo() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const [typed, setTyped] = useState(0);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const demo = DEMOS[index];

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      if (reduce || typed >= demo.prompt.length) {
        timer = setTimeout(() => {
          setTyped(demo.prompt.length);
          setPhase("rendering");
        }, reduce ? 0 : 400);
      } else {
        timer = setTimeout(() => setTyped((t) => t + 1), 40);
      }
    } else if (phase === "rendering") {
      if (progress >= 100) {
        timer = setTimeout(() => setPhase("playing"), 200);
      } else {
        timer = setTimeout(() => setProgress((p) => Math.min(100, p + (reduce ? 100 : 5))), 40);
      }
    } else {
      const video = videoRef.current;
      if (video && !reduce) {
        video.currentTime = 0;
        video.play().catch(() => {});
      }
      timer = setTimeout(() => {
        setIndex((i) => (i + 1) % DEMOS.length);
        setTyped(0);
        setProgress(0);
        setPhase("typing");
      }, PLAY_MS);
    }
    return () => clearTimeout(timer);
  }, [phase, typed, progress, demo.prompt.length]);

  return (
    <div className="demo">
      <div className="demo-glow" aria-hidden="true" />
      <div className="player">
        <div className={`player-stage ${phase === "playing" ? "is-playing" : ""}`}>
          <video
            ref={videoRef}
            key={demo.src}
            className="stage-video"
            src={demo.src}
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
            style={phase === "playing" ? undefined : { filter: `blur(${Math.round((100 - progress) / 6)}px) saturate(${0.4 + progress / 170})` }}
          />
          {phase !== "playing" && (
            <div className="render-overlay">
              <div className="render-grid" aria-hidden="true" />
              <p className="render-label">{phase === "typing" ? "프롬프트 입력 중" : `영상 생성 중 · ${progress}%`}</p>
            </div>
          )}
          <span className="chip chip-ai">예시 영상</span>
          <span className="chip chip-meta">{demo.meta}</span>
        </div>
        <div className="player-bar">
          <span className="play-icon" aria-hidden="true">
            {phase === "playing" ? "❚❚" : "▶"}
          </span>
          <div className="timeline">
            <div
              className={`timeline-fill ${phase === "playing" ? "run" : ""}`}
              style={phase === "rendering" ? { width: `${progress}%` } : undefined}
            />
          </div>
          <span className="time">{phase === "playing" ? demo.meta.split("· ")[1] : "--:--"}</span>
        </div>
      </div>

      <div className="demo-prompt" aria-live="polite">
        <span className="spark" aria-hidden="true">
          ✦
        </span>
        <p>
          {demo.prompt.slice(0, typed)}
          {phase === "typing" && <span className="caret" aria-hidden="true" />}
        </p>
        <span className={`demo-btn ${phase === "rendering" ? "busy" : ""}`}>{phase === "rendering" ? "생성 중" : "생성"}</span>
      </div>
    </div>
  );
}

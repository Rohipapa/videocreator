"use client";

import { useEffect, useRef } from "react";

// 화면에 보일 때만 소리 없이 반복 재생한다. 움직임 줄이기 설정이면 첫 프레임만 보여 준다.
export function AutoVideo({ src, className = "" }: { src: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.15 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return <video ref={ref} className={`auto-video ${className}`} src={`${src}#t=0.1`} muted loop playsInline preload="metadata" aria-hidden="true" />;
}

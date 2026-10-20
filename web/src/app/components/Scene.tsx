// CSS로 그린 움직이는 "영상 장면". 실제 AI 결과물 대신 첫 화면·라이브러리 미리보기에 쓴다.
export const SCENES = ["beach", "city", "forest", "product", "space", "ocean"] as const;
export type SceneName = (typeof SCENES)[number];

/** 문자열(작업 ID 등)로 항상 같은 장면을 고른다. */
export function sceneFor(seed: string): SceneName {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SCENES[h % SCENES.length];
}

export function Scene({ name, className = "" }: { name: SceneName; className?: string }) {
  return (
    <div className={`scene scene-${name} ${className}`} aria-hidden="true">
      <span className="l1" />
      <span className="l2" />
      <span className="l3" />
      <span className="l4" />
    </div>
  );
}

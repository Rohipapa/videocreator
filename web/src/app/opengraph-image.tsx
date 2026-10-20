import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

// 링크 공유·검색 결과 미리보기 이미지. 빌드할 때 한 번 만든다.
export const alt = `${SITE_NAME} — 글로 쓰면 영상이 됩니다`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HEADLINE = "글로 쓰면, 영상이 됩니다.";
const SUB = "텍스트 한 줄로 만드는 AI 영상 · 16:9 · 9:16 · 1:1";

// 기본 글꼴에는 한글이 없으므로, 쓰는 글자만 담은 Noto Sans KR을 받아 온다. 실패하면 기본 글꼴로 그린다.
// 캐시해 두어 이미지가 빌드 때 한 번만 만들어지게 한다(캐시 값은 직렬화할 수 있도록 base64 문자열).
async function loadKoreanFont(text: string): Promise<string | null> {
  "use cache";
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@800&text=${encodeURIComponent(text)}`)
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return Buffer.from(await (await fetch(url)).arrayBuffer()).toString("base64");
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const b64 = await loadKoreanFont(HEADLINE + SUB + SITE_NAME);
  const font = b64 ? Buffer.from(b64, "base64") : null;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#08080c",
          backgroundImage:
            "radial-gradient(circle at 15% 20%, rgba(255,46,99,0.35), transparent 45%), radial-gradient(circle at 85% 80%, rgba(61,123,255,0.35), transparent 45%)",
          color: "#f5f5fa",
          fontFamily: font ? "NotoSansKR" : "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 36 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundImage: "linear-gradient(100deg, #ff2e63 0%, #e63cff 38%, #8b5cff 64%, #3d7bff 100%)",
            }}
          >
            <svg width="24" height="28" viewBox="0 0 10 12" style={{ marginLeft: 4 }}>
              <path d="M0 0 L10 6 L0 12 Z" fill="#fff" />
            </svg>
          </div>
          {SITE_NAME}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 92,
              lineHeight: 1.1,
              backgroundImage: "linear-gradient(100deg, #ff2e63 0%, #e63cff 38%, #8b5cff 64%, #3d7bff 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {HEADLINE}
          </div>
          <div style={{ fontSize: 36, color: "#a3a3b8" }}>{SUB}</div>
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "NotoSansKR", data: font, weight: 800, style: "normal" }] : undefined },
  );
}

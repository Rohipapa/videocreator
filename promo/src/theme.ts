import { continueRender, delayRender, staticFile } from "remotion";

// web/src/app/globals.css의 디자인 토큰과 같은 값
export const C = {
  bg: "#08080c",
  surface: "#14141c",
  border: "#2a2a3a",
  text: "#f5f5fa",
  muted: "#a3a3b8",
  subtle: "#6e6e85",
  red: "#ff2e63",
  magenta: "#e63cff",
  violet: "#8b5cff",
  blue: "#3d7bff",
};

export const GRAD = "linear-gradient(100deg, #ff2e63 0%, #e63cff 38%, #8b5cff 64%, #3d7bff 100%)";
export const FONT = "Pretendard, 'Malgun Gothic', sans-serif";

// Pretendard 가변 글꼴을 렌더링 전에 불러온다.
const handle = delayRender("Pretendard 글꼴 로드");
const face = new FontFace("Pretendard", `url(${staticFile("fonts/PretendardVariable.woff2")}) format("woff2")`, {
  weight: "45 920",
});
face
  .load()
  .then((f) => {
    document.fonts.add(f);
    continueRender(handle);
  })
  .catch((err) => {
    console.error(err);
    continueRender(handle);
  });

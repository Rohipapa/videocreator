# 홍보영상 (Remotion)

AI 비디오 스튜디오 홍보영상(1920×1080, 30fps, 29초, 무음)을 코드로 만드는 프로젝트입니다. 장면 구성은 `src/Promo.tsx`, 디자인 토큰과 글꼴은 `src/theme.ts`(사이트 `globals.css`와 같은 값)에 있습니다.

| 구간 | 내용 |
|---|---|
| 0~3초 | 인트로: "머릿속에 그린 장면, 글로 쓰면 영상이 됩니다" |
| 3~23.5초 | 프롬프트 입력 → 생성하기 → 스캔 라인으로 드러나는 영상 → 전체 화면 (풍경·반려견·자동차·전투기) |
| 23.5~26초 | 세로 카드 4장 + 화면 비율(16:9·9:16·1:1) |
| 26~29초 | 엔딩: 로고, "월 9,900원부터", 주소 |

## 다시 만들기

`assets/src/`(원본)와 `assets/clips/`(1080p 변환본)는 용량이 커서 커밋하지 않습니다. 아래 출처에서 원본을 받아 `assets/src/`에 두고 변환합니다.

```bash
npm install   # postinstall이 Pretendard 글꼴을 assets/fonts/에 복사
FF=node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe
$FF -i assets/src/landscape-4k.mp4 -an -vf "scale=-2:1080:flags=lanczos,crop=1920:1080" -c:v libx264 -crf 14 -pix_fmt yuv420p assets/clips/landscape.mp4
# car-4k → car, dog → dog도 같은 방식. 전투기는 ../web/public/videos/hero-jet.mp4(1080p)를 assets/clips/jet.mp4로 복사
npx remotion bundle src/index.ts --out-dir=build
O="--port=3123 --concurrency=2 --offthreadvideo-cache-size-in-bytes=2000000000"
npx remotion render build Promo out/part-a.mp4 --frames=0-419 $O
npx remotion render build Promo out/part-b.mp4 --frames=420-704 $O
npx remotion render build Promo out/part-c.mp4 --frames=705-869 $O
printf "file 'part-a.mp4'\nfile 'part-b.mp4'\nfile 'part-c.mp4'\n" > out/list.txt
$FF -f concat -safe 0 -i out/list.txt -c copy -movflags +faststart out/promo.mp4
```

- 한 번에 870프레임을 렌더링하면 이 PC에서 739프레임(몽타주) 부근에서 멈춥니다. 위처럼 세 구간으로 나눠 렌더링한 뒤 재인코딩 없이 이어 붙입니다.
- 3000번 포트를 Next dev 서버가 쓰고 있으면 Remotion이 그 서버에 붙어 404가 나므로 `--port`를 따로 줍니다.
- 장면 미리보기: `npx remotion still build Promo out/f.jpg --frame=240 --port=3123`

## 영상 출처

AI 생성 결과물이 아닌 무료 스톡 영상입니다. 영상 안에도 "예시용 스톡 영상"이라고 표기합니다. 서비스 실제 출력은 4K가 아니므로 화면 문구에 해상도를 내세우지 않습니다.

| 파일 | 출처 | 라이선스 |
|---|---|---|
| `landscape.mp4` | [Mixkit #51689](https://mixkit.co/free-stock-video/flying-over-a-monumental-rocky-mountain-with-visible-snow-and-51689/) (4K 원본) | Mixkit Stock Video Free License |
| `car.mp4` | [Pexels #20153917](https://www.pexels.com/video/a-car-is-driving-down-a-road-in-the-middle-of-the-day-20153917/) (4K 원본) | Pexels License |
| `dog.mp4` | [Pixabay #327638](https://pixabay.com/videos/border-collie-dog-running-fast-327638/) (3872×2160 원본) | Pixabay Content License |
| `jet.mp4` | [Pixabay #284488](https://pixabay.com/videos/military-fighter-jet-flying-284488/) (1080p 원본) | Pixabay Content License |

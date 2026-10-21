# 홍보영상 (Remotion)

AI 비디오 스튜디오 홍보영상(1920×1080, 30fps, 29.2초, 배경음악 포함)을 코드로 만드는 프로젝트입니다. 장면 구성은 `src/Promo.tsx`, 디자인 토큰과 글꼴은 `src/theme.ts`(사이트 `globals.css`와 같은 값)에 있습니다.

| 구간 | 내용 |
|---|---|
| 0~3초 | 인트로: "머릿속에 그린 장면, 글로 쓰면 영상이 됩니다" (음악 빌드업) |
| 3~22.8초 | 프롬프트 입력 → 생성하기 → 스캔 라인으로 드러나는 영상 → 전체 화면 (풍경·반려견·자동차·전투기). 첫 "생성하기" 클릭(5.2초)에 드롭 |
| 22.8~26초 | 세로 카드 4장(박자마다 하나씩) + 화면 비율(16:9·9:16·1:1) |
| 26~29.2초 | 엔딩: 로고, "월 9,900원부터", 주소 (음악 페이드아웃) |

## 음악과 박자

배경음악은 150BPM이라 30fps에서 1박 = 12프레임, 1마디 = 48프레임입니다. 원곡 25.6초의 드롭을 첫 클릭(156프레임)에 맞췄고(원곡 20.4초부터 재생), 이후 장면 경계(252·396·540·684·780프레임)는 모두 마디 시작입니다. 장면 길이를 바꾸면 `BAR` 단위를 유지해야 박자가 어긋나지 않습니다.

## 다시 만들기

`assets/src/`(영상 원본), `assets/clips/`(1080p 변환본), `assets/music/`(음악)은 커밋하지 않습니다. 아래 출처에서 받아 둡니다.

```bash
npm install   # postinstall이 Pretendard 글꼴을 assets/fonts/에 복사
FF=node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe
$FF -i assets/src/landscape-4k.mp4 -an -vf "scale=-2:1080:flags=lanczos,crop=1920:1080" -c:v libx264 -crf 14 -pix_fmt yuv420p assets/clips/landscape.mp4
# car-4k → car, dog → dog도 같은 방식. 전투기는 ../web/public/videos/hero-jet.mp4(1080p)를 assets/clips/jet.mp4로 복사
curl -o assets/music/cant-get-you-off-my-mind.mp3 https://assets.mixkit.co/music/1210/1210.mp3
npx remotion bundle src/index.ts --out-dir=build
O="--port=3123 --concurrency=2 --offthreadvideo-cache-size-in-bytes=2000000000"
npx remotion render build Promo out/part-a.mp4 --frames=0-395 --muted $O
npx remotion render build Promo out/part-b.mp4 --frames=396-683 --muted $O
npx remotion render build Promo out/part-c.mp4 --frames=684-875 --muted $O
# 음악: 원곡 20.4초부터 29.2초, Promo.tsx의 <Audio> 볼륨(0.4초 페이드인, 마지막 1.33초 페이드아웃)과 같게 자른다
$FF -ss 20.4 -t 29.2 -i assets/music/cant-get-you-off-my-mind.mp3 -af "volume='if(lt(t,0.4),t/0.4*0.9,if(gt(t,27.867),max(0,(29.2-t)/1.333)*0.9,0.9))':eval=frame,aresample=48000" -c:a pcm_s16le out/music.wav
printf "file 'part-a.mp4'\nfile 'part-b.mp4'\nfile 'part-c.mp4'\n" > out/list.txt
$FF -f concat -safe 0 -i out/list.txt -i out/music.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart out/promo.mp4
```

- 한 번에 전체를 렌더링하면 이 PC에서 몽타주 구간 부근에서 멈춥니다. 영상은 세 구간으로 나눠 무음으로 렌더링해 재인코딩 없이 잇고, 음악은 원곡에서 한 번에 잘라 합칩니다(구간마다 음악을 넣으면 이음새에서 소리가 끊깁니다). `remotion.config.ts`의 `setCrf` 때문에 `--codec=wav` 렌더링은 실패합니다.
- 3000번 포트를 Next dev 서버가 쓰고 있으면 Remotion이 그 서버에 붙어 404가 나므로 `--port`를 따로 줍니다.
- 장면 미리보기: `npx remotion still build Promo out/f.jpg --frame=240 --port=3123`

## 영상·음악 출처

영상은 AI 생성 결과물이 아닌 무료 스톡 영상입니다. 영상 안에도 "예시용 스톡 영상"이라고 표기합니다. 서비스 실제 출력은 4K가 아니므로 화면 문구에 해상도를 내세우지 않습니다.

| 파일 | 출처 | 라이선스 |
|---|---|---|
| `landscape.mp4` | [Mixkit #51689](https://mixkit.co/free-stock-video/flying-over-a-monumental-rocky-mountain-with-visible-snow-and-51689/) (4K 원본) | Mixkit Stock Video Free License |
| `car.mp4` | [Pexels #20153917](https://www.pexels.com/video/a-car-is-driving-down-a-road-in-the-middle-of-the-day-20153917/) (4K 원본) | Pexels License |
| `dog.mp4` | [Pixabay #327638](https://pixabay.com/videos/border-collie-dog-running-fast-327638/) (3872×2160 원본) | Pixabay Content License |
| `jet.mp4` | [Pixabay #284488](https://pixabay.com/videos/military-fighter-jet-flying-284488/) (1080p 원본) | Pixabay Content License |
| `cant-get-you-off-my-mind.mp3` | [Mixkit 음악 #1210](https://mixkit.co/free-stock-music/instrument/drums/) "Can't Get You Off My Mind" — Michael Ramir C. (퓨처 베이스, 1분 31초) | Mixkit Stock Music Free License |

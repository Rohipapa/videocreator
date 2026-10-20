# AI 비디오 스튜디오 — 테스트 환경

[PRD v1.2](../PRD.md)의 MVP 중 **구독 결제(토스페이먼츠 자동결제)**와 **크레딧 기반 생성 흐름**을 테스트 키로 검증하는 앱입니다.

| 영역 | 테스트 환경 구현 | 운영 전환 시 교체 |
|---|---|---|
| 결제 | 토스페이먼츠 v2 자동결제(빌링) 결제창 + 서버 API (실제 연동) | 라이브 키로 교체 (자동결제 계약 필요) |
| 정기결제 | `POST /api/cron/billing` + 테스트 도구 화면 | 외부 cron이 매일 호출 |
| DB | 로컬 SQLite (`data/app.db`, Node 내장 `node:sqlite`) | Postgres 등 |
| 로그인 | 이메일만 입력하는 간이 로그인 | 이메일 인증이 있는 인증 서비스 |
| 동영상 생성 | 모의 제공자 (약 10초 후 완료, 프롬프트에 `[실패]`를 넣으면 실패) | 실제 AI 동영상 API |

## 실행 방법

1. 토스페이먼츠 개발자센터에 가입하고 [API 키](https://developers.tosspayments.com/my/api-keys) 메뉴에서 **API 개별 연동 키**의 테스트 키를 확인합니다. 결제위젯 연동 키가 아닌 키를 써야 합니다.
2. `.env.local`의 `NEXT_PUBLIC_TOSS_CLIENT_KEY`(`test_ck_…`)와 `TOSS_SECRET_KEY`(`test_sk_…`)를 채웁니다. `BILLING_KEY_SECRET`과 `CRON_SECRET`은 이미 무작위 값으로 생성되어 있습니다. 항목 설명은 `.env.example`을 참고하세요.
3. 개발 서버를 실행합니다.

```bash
npm run dev
```

4. http://localhost:3000 에서 로그인 → 요금제 → **카드 등록하고 구독 시작**을 누릅니다. 테스트 결제창에서 카드번호를 입력하고, 본인인증 번호는 `000000`을 입력합니다.

## 테스트 시나리오

| 확인할 것 | 방법 |
|---|---|
| 구독 시작·첫 결제·크레딧 지급 | 요금제 화면에서 카드 등록 |
| 생성 시 크레딧 예약·확정 | 만들기 → 내 영상에서 상태 변화 확인 |
| 생성 실패 시 크레딧 복구 | 프롬프트에 `[실패]` 포함 |
| 다음 달 자동결제 | 테스트 도구 → 결제일 당기기 → 스케줄러 실행 |
| 해지 예약 → 기간 종료 시 해지 | 구독 관리 → 구독 해지 → 테스트 도구에서 두 버튼 실행 |
| 결제 카드 변경 | 구독 관리 → 결제 카드 변경 |

## 결제 설계 요약

- 시크릿 키와 `api.tosspayments.com` 호출은 서버에서만 다룹니다(`src/lib/toss.ts`).
- 빌링키는 AES-256-GCM으로 암호화해 저장합니다(`src/lib/crypto.ts`). `BILLING_KEY_SECRET`을 바꾸면 기존 빌링키를 복호화할 수 없습니다.
- 결제 시도마다 고유한 `orderId`(`sub_{구독ID}_c{회차}_a{시도}`)를 쓰고, 같은 값을 `Idempotency-Key` 헤더로 보냅니다. (구독, 회차)당 성공 결제는 DB 유니크 인덱스로 하나만 허용합니다.
- 네트워크 오류처럼 결과를 알 수 없는 결제는 `UNKNOWN`으로 기록하고, 다음 실행 때 같은 `orderId`로 다시 요청합니다.
- 결제 실패 시 `past_due`로 바꾸고 1일, 3일 뒤 재시도합니다. 모두 실패하면 `expired`로 바꾸고 빌링키를 삭제합니다.
- 크레딧은 원장(`credit_ledger`)에 지급·예약·해제·확정·만료를 기록합니다. 미사용 크레딧은 이월하지 않습니다.

## 영상 출처

첫 화면의 예시 영상(`public/videos/`)은 AI가 생성한 결과물이 아닌 무료 스톡 영상입니다. 2026-10-20에 각 페이지에서 라이선스를 확인했습니다.

| 파일 | 출처 | 라이선스 |
|---|---|---|
| `hero-landscape.mp4` | [Mixkit #51689](https://mixkit.co/free-stock-video/flying-over-a-monumental-rocky-mountain-with-visible-snow-and-51689/) | Mixkit Stock Video Free License |
| `hero-dog.mp4` | [Pixabay #327638](https://pixabay.com/videos/border-collie-dog-running-fast-327638/) | Pixabay Content License |
| `hero-car.mp4` | [Mixkit #52427](https://mixkit.co/free-stock-video/a-red-sports-car-traveling-along-a-curvy-asphalt-road-52427/) | Mixkit Stock Video Free License |
| `hero-jet.mp4` | [Pixabay #284488](https://pixabay.com/videos/military-fighter-jet-flying-284488/) | Pixabay Content License |
| `gallery-alps.mp4` | [Mixkit #4132](https://mixkit.co/free-stock-video/mountainous-area-in-the-alps-4132/) | Mixkit Stock Video Free License |
| `gallery-canyon.mp4` | [Mixkit #41401](https://mixkit.co/free-stock-video/fly-over-a-huge-canyon-covered-in-vegetation-41401/) | Mixkit Stock Video Free License |
| `gallery-cliff.mp4` | [Mixkit #51455](https://mixkit.co/free-stock-video/aerial-view-of-waves-hitting-a-small-cliff-51455/) | Mixkit Stock Video Free License |
| `gallery-collies.mp4` | [Pixabay #7259](https://pixabay.com/videos/border-collies-dogs-pets-playing-7259/) | Pixabay Content License |
| `gallery-redcar.mp4` | [Mixkit #74](https://mixkit.co/free-stock-video/red-sports-car-74/) | Mixkit Stock Video Free License |
| `gallery-jet.mp4` | [Pixabay #33919](https://pixabay.com/videos/jet-fighter-jet-plane-flying-33919/) | Pixabay Content License |

## 운영 전 남은 일

- 토스페이먼츠 자동결제 계약과 라이브 키 전환
- 실제 인증 서비스와 운영 DB로 교체
- 실제 AI 동영상 제공자 연동 및 파일 저장소, 만료형 다운로드 URL
- 토스페이먼츠 웹훅 수신(결제 취소·환불 동기화), 관리자 화면

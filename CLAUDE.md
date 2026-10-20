# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 저장소 구성

- `PRD.md`: 제품 요구사항(v1.2). 구독 상태별 허용 기준, 크레딧 정책, 결제 흐름, Supabase 연동 범위(8.2~8.4, 7.7), 현재 구현 현황(17장)의 기준 문서입니다. 정책이나 구현 상태가 바뀌면 이 문서도 함께 고칩니다.
- `web/`: Next.js 16(App Router, TypeScript) 앱. PRD의 MVP 중 **토스페이먼츠 자동결제(빌링) 구독**과 **크레딧 기반 생성 흐름**을 테스트 키로 검증하는 테스트 환경입니다.
- `.mcp.json`: 토스페이먼츠 연동 가이드 MCP(`@tosspayments/integration-guide-mcp`). 토스 API·SDK 사용법은 기억에 의존하지 말고 이 MCP로 확인합니다.
- Supabase: 프로젝트 `videocreator`(ID `wucxicyzydzwqtvmuaza`, 서울 리전). Supabase MCP로 스키마 변경(`apply_migration`)과 문서 검색(`search_docs`)을 합니다. 같은 조직의 `moosin-shop` 프로젝트는 **다른 서비스**이므로 건드리지 않습니다.
- 원격 저장소: https://github.com/Rohipapa/videocreator (공개 저장소, 브랜치 `main`)

## 명령어

모두 `web/`에서 실행합니다. 테스트 프레임워크는 아직 없습니다.

```bash
npm run dev          # 개발 서버 (http://localhost:3000)
npm run build        # 프로덕션 빌드 (타입 검사·Cache Components 검증 포함)
npx eslint src       # 린트
npx tsc --noEmit     # 타입 검사만
```

- 환경변수는 `web/.env.local`(커밋 금지, `.env.example` 참고): `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `BILLING_KEY_SECRET`(base64 32바이트), `CRON_SECRET`, 선택 `TOSS_API_BASE`. Supabase 전환 후에는 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`가 추가됩니다.
- 이 PC(Windows)는 Node.js·Git을 winget으로 설치했습니다. 셸에서 `node`/`git`을 못 찾으면 PATH를 다시 읽습니다: `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`

## Next.js 16 주의사항 (`web/AGENTS.md`)

학습 데이터와 API·관례가 다를 수 있으므로 코드를 쓰기 전에 `web/node_modules/next/dist/docs/`의 해당 가이드를 읽습니다. 특히 이 프로젝트는 **Cache Components**(`cacheComponents: true`)가 켜져 있어서 다음 규칙을 어기면 빌드나 dev 검증이 실패합니다.

- `cookies()`·`searchParams`처럼 요청 시점 데이터를 읽는 컴포넌트는 `<Suspense>` 안에 둡니다. 각 페이지는 `XxxPage`(Suspense 래퍼) + `XxxPageContent`(실제 내용) 패턴을 씁니다.
- `new Date()`·`Date.now()`는 요청 시점이 확정된 뒤에만 쓸 수 있습니다. `getCurrentUser()`가 맨 앞에서 `await connection()`을 호출하므로, 세션을 먼저 읽은 뒤에 DB·시간 로직을 실행합니다.
- `params`/`searchParams`/`cookies()`는 모두 `await`가 필요하고, 페이지 props 타입은 전역 `PageProps<"/경로">`를 씁니다.

## 아키텍처

### 서버 로직 (`web/src/lib/`, 모두 `server-only`)

- `db.ts`: Node 내장 `node:sqlite`의 동기 API, 파일은 `web/data/app.db`(gitignore). 스키마 생성과 요금제 시드를 모듈 로드 시 수행하고, 연결은 `globalThis`에 캐시합니다. 다중 쓰기는 `transaction()`(BEGIN IMMEDIATE)으로 묶습니다. 운영 전환 시 Postgres로 교체할 예정입니다.
- `auth.ts`: 테스트용 간이 로그인(이메일만으로 계정 생성, `sessions` 테이블 + httpOnly 쿠키). 사용자마다 토스 `customerKey`(UUID)를 발급합니다.
- `toss.ts`: 토스페이먼츠 서버 API 래퍼(빌링키 발급·자동결제 승인·빌링키 삭제). 시크릿 키 Basic 인증, 승인 요청에는 `orderId`를 `Idempotency-Key`로 보냅니다. `TOSS_API_BASE`로 모의 서버를 가리킬 수 있습니다. `isTestMode()`는 시크릿 키가 `test_`로 시작하는지로 판단합니다.
- `billing.ts`: 구독 도메인의 핵심.
  - `handleBillingAuthSuccess`: 결제창 successUrl 이후 빌링키 발급 → 구독 생성(`pending`) → 첫 결제. 이미 이용 중인 구독이 있으면 **결제 카드 변경**으로 처리합니다.
  - `chargeSubscription`: 스케줄러와 첫 결제가 공유. DB 잠금(`billing_lock_until`)으로 동시 실행 방지, `orderId = sub_{구독ID}_c{회차}_a{시도}`, (구독, 회차)당 DONE 결제는 유니크 인덱스로 하나만 허용. 네트워크 오류·5xx는 `UNKNOWN`으로 남기고 다음 실행 때 **같은 orderId로 재요청**합니다.
  - 실패 정책: 2회차 이상은 `past_due` → 1일, 3일 뒤 재시도 → 그래도 실패하면 `expired` + 빌링키 삭제 + 잔여 크레딧 만료. 첫 결제 실패는 바로 `expired`.
  - `runBillingScheduler`: 기간이 끝난 `cancel_at_period_end`를 `canceled`로 정리하고, `next_billing_at`이 지난 구독을 결제합니다.
  - `canGenerate(status)`: PRD 4.3의 상태별 생성 허용 기준(`active`, `cancel_at_period_end`만 허용).
- `credits.ts`: 잔액을 저장하지 않는 **원장(ledger)** 방식. 잔액 = `credit_ledger.amount` 합계. 유형은 `grant`(+), `reserve`(−), `release`(+), `consume`(0, 확정 기록), `expire`(−), `adjust`. 새 결제 회차에는 미사용분을 만료시키고 새로 지급합니다(이월 없음). 진행 중 작업의 예약분은 만료에서 제외합니다.
- `generation.ts`: 모의 AI 제공자. 생성 요청 시 서버에서 구독 상태·요금제 최대 길이·잔액을 검증하고, 폼의 `idempotencyKey`로 중복 생성을 막으며 크레딧을 예약합니다. 진행은 `advanceMockJobs()`가 **페이지 조회 시점**에 경과 시간으로 상태를 갱신합니다(대기 2초 → 생성 8초). 프롬프트에 `[실패]`가 있으면 실패하고 크레딧을 복구합니다. 실제 제공자 연동 시 이 모듈만 교체합니다.

### 라우트 (`web/src/app/`)

- 변경 작업은 `actions.ts`의 서버 액션이 처리하고, 결과는 `?msg=`/`?err=` 쿼리로 리다이렉트해 `components/Flash`가 표시합니다.
- `billing/success/route.ts`: 토스 결제창 successUrl(GET). 처리 후 즉시 `/subscription`으로 리다이렉트해 일회성 `authKey` 재사용을 막습니다. `billing/fail/page.tsx`는 failUrl.
- `api/cron/billing/route.ts`: 외부 cron용 `POST`, `Authorization: Bearer {CRON_SECRET}` 필요.
- `/dev`: 테스트 키일 때만 동작하는 도구(결제일을 지금으로 당기기, 스케줄러 즉시 실행). 한 달을 기다리지 않고 정기결제·해지 흐름을 확인할 때 씁니다.
- `components/BillingButton.tsx`: 클라이언트에서 `@tosspayments/tosspayments-sdk`의 `requestBillingAuth({ method: "CARD" })`로 자동결제 등록창을 엽니다(클라이언트 키만 사용).

### 첫 화면과 디자인

- `globals.css` 하나에 디자인 토큰(다크 캔버스 + 빨강·보라·파랑 그라디언트 `--grad`)과 모든 스타일이 있습니다. 다크 테마 단일 구성입니다.
- `components/HeroDemo.tsx`: 프롬프트 타이핑 → 생성(블러가 걷힘) → 재생을 반복하는 데모. `components/AutoVideo.tsx`는 화면에 보일 때만 재생하고 `prefers-reduced-motion`이면 재생하지 않습니다.
- `web/public/videos/`의 예시 영상은 AI 결과물이 아닌 무료 스톡 영상(Mixkit Free License, Pixabay Content License)이므로 화면에 "AI 생성"이라고 표기하지 않습니다. 출처 목록은 `web/README.md`의 "영상 출처"에 있고, 영상을 추가·교체하면 그 표도 갱신합니다.
- `components/Scene.tsx`: CSS로 그린 장면. 지금은 내 영상 라이브러리의 모의 결과 미리보기에만 씁니다.

## Supabase 전환 (진행 중)

현재 코드는 아직 로컬 SQLite와 간이 로그인을 씁니다. 전환 순서와 설계는 `PRD.md` 8.2~8.4, 7.7을 따릅니다. 진행할 때 지킬 점:

- **순서**: Database + RLS + RPC → Auth → Cron → Storage → Realtime·관리자. 각 단계 후에도 아래 "결제 로직 검증 방법"의 시나리오가 그대로 통과해야 합니다.
- **DB 접근**: 결제·빌링키·크레딧 쓰기는 서버에서 Supabase 시크릿 키(`SUPABASE_SECRET_KEY`) 클라이언트로만 합니다. 사용자 역할에는 쓰기 정책을 주지 않고, `subscriptions.billing_key_enc` 컬럼 조회 권한을 회수합니다.
- **원자성**: 지금 `transaction()`으로 묶인 작업(생성 요청의 잔액 확인+예약, 결제 성공 반영+크레딧 갱신, 결제 잠금)은 supabase-js에 트랜잭션이 없으므로 Postgres 함수(RPC, `security definer`, 실행 권한은 `service_role`만)로 옮깁니다.
- **`lib/` 함수가 비동기로 바뀝니다**: 지금 동기 함수인 `getBalance`, `getCurrentSubscription`, `advanceMockJobs` 등을 쓰는 페이지·액션에 `await`를 추가해야 합니다.
- **Auth**: `@supabase/ssr`로 서버 클라이언트(`cookies()` 기반)와 `proxy.ts`(Next.js 16의 미들웨어, `getClaims()`로 토큰 갱신)를 둡니다. 로그인 확인 전에 `connection()`을 호출하는 현재 규칙은 유지합니다. 서버 코드에서 권한 판단에는 `getSession()`이 아니라 `getClaims()`/`getUser()`를 씁니다.
- 스키마를 바꾼 뒤에는 Supabase 보안 점검(`get_advisors`)으로 RLS 누락을 확인합니다.
- 시크릿 키는 MCP로 가져올 수 없으므로 사용자가 대시보드에서 복사해 `web/.env.local`에 넣어야 합니다. 인증 메일 템플릿 변경, SMTP 연결도 대시보드 작업입니다.

## 결제 로직 검증 방법

실제 토스 테스트 키 없이 결제 로직을 확인할 때는 토스 API를 흉내 내는 로컬 모의 서버를 띄우고, 별도 포트의 dev 서버에 `TOSS_API_BASE=http://127.0.0.1:4010`, `TOSS_SECRET_KEY=test_sk_mock`을 주입해 `/billing/success?authKey=...&customerKey=<사용자 customer_key>&planId=basic`을 직접 호출합니다. 이후 `/dev`에서 결제일 당기기와 스케줄러 실행을 반복하며 `subscriptions`, `payments`, `credit_ledger` 테이블을 확인합니다. 테스트가 끝나면 `web/data/`를 지워 테스트 데이터를 정리합니다.

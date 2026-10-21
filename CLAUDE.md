# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 저장소 구성

- `PRD.md`: 제품 요구사항(v1.2). 구독 상태별 허용 기준, 크레딧 정책, 결제 흐름, Supabase 연동 범위(8.2~8.4, 7.7), 현재 구현 현황(17장)의 기준 문서입니다. 정책이나 구현 상태가 바뀌면 이 문서도 함께 고칩니다.
- `web/`: Next.js 16(App Router, TypeScript) 앱. PRD의 MVP 중 **토스페이먼츠 자동결제(빌링) 구독**과 **크레딧 기반 생성 흐름**을 테스트 키로 검증하는 테스트 환경입니다.
- `promo/`: Remotion으로 만드는 홍보영상(29초, 1080p). 영상 원본·변환본·글꼴·렌더링 결과는 커밋하지 않으며, 다시 만드는 방법과 영상 출처는 `promo/README.md`에 있습니다.
- `.mcp.json`: 토스페이먼츠 연동 가이드 MCP(`@tosspayments/integration-guide-mcp`). 토스 API·SDK 사용법은 기억에 의존하지 말고 이 MCP로 확인합니다.
- Supabase: 프로젝트 `videocreator`(ID `wucxicyzydzwqtvmuaza`, 서울 리전). Supabase MCP로 스키마 변경(`apply_migration`)과 문서 검색(`search_docs`)을 합니다. 적용한 마이그레이션은 같은 이름·버전으로 `supabase/migrations/`에도 SQL 파일로 남기고, 스키마를 바꾸면 `generate_typescript_types` 결과로 `web/src/lib/supabase/database.types.ts`를 갱신합니다. 같은 조직의 `moosin-shop` 프로젝트는 **다른 서비스**이므로 건드리지 않습니다.
- 원격 저장소: https://github.com/Rohipapa/videocreator (공개 저장소, 브랜치 `main`)
- 배포: Vercel, https://videocreator-tau.vercel.app (아래 "배포" 참고)

## 명령어

모두 `web/`에서 실행합니다. 테스트 프레임워크는 아직 없습니다.

```bash
npm run dev          # 개발 서버 (http://localhost:3000)
npm run build        # 프로덕션 빌드 (타입 검사·Cache Components 검증 포함)
npx eslint src       # 린트
npx tsc --noEmit     # 타입 검사만
```

- 환경변수는 `web/.env.local`(커밋 금지, `.env.example` 참고): `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `BILLING_KEY_SECRET`(base64 32바이트), `CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`(서버 전용, 사용자가 대시보드에서 복사), 선택 `TOSS_API_BASE`.
- 이 PC(Windows)는 Node.js·Git을 winget으로 설치했습니다. 셸에서 `node`/`git`을 못 찾으면 PATH를 다시 읽습니다: `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`
- PowerShell에서는 실행 정책 때문에 `npx`가 막히므로 `npx.cmd`를 쓰거나 Bash 도구에서 실행합니다. `python`은 설치되어 있지 않아 스크립트 편집은 `node -e`/`node -` heredoc으로 합니다.
- `web/src` 파일 일부는 CRLF 줄바꿈이라 `sed`의 `$`·줄 단위 치환이 빗나갑니다. 여러 줄 치환은 `\r?\n`을 허용하는 node 스크립트나 Edit 도구로 합니다.
- 새 라우트를 만들면 `PageProps<"/새경로">` 타입이 아직 없어 `tsc`가 실패합니다. `npm run build`를 한 번 돌려 라우트 타입을 생성한 뒤 다시 검사합니다.

## Next.js 16 주의사항 (`web/AGENTS.md`)

학습 데이터와 API·관례가 다를 수 있으므로 코드를 쓰기 전에 `web/node_modules/next/dist/docs/`의 해당 가이드를 읽습니다. 특히 이 프로젝트는 **Cache Components**(`cacheComponents: true`)가 켜져 있어서 다음 규칙을 어기면 빌드나 dev 검증이 실패합니다.

- `src/proxy.ts`가 Next.js 16의 미들웨어입니다(`middleware.ts`가 아님).
- `cookies()`·`searchParams`처럼 요청 시점 데이터를 읽는 컴포넌트는 `<Suspense>` 안에 둡니다. 각 페이지는 `XxxPage`(Suspense 래퍼) + `XxxPageContent`(실제 내용) 패턴을 씁니다.
- `new Date()`·`Date.now()`는 요청 시점이 확정된 뒤에만 쓸 수 있습니다. `getCurrentUser()`가 맨 앞에서 `await connection()`을 호출하므로, 세션을 먼저 읽은 뒤에 DB·시간 로직을 실행합니다.
- `params`/`searchParams`/`cookies()`는 모두 `await`가 필요하고, 페이지 props 타입은 전역 `PageProps<"/경로">`를 씁니다.

## 아키텍처

### 서버 로직 (`web/src/lib/`, 모두 `server-only`)

- `db.ts`: 도메인 타입(`Plan`, `Subscription`, `Payment`, `Job` 등)과 `nowIso()`만 둡니다. 데이터는 Supabase Postgres에 있습니다.
- `supabase/admin.ts`: 시크릿 키(service_role) 클라이언트 `admin()`과 `unwrap`/`unwrapMaybe`(오류면 예외). RLS를 우회하므로 모든 조회·쓰기에 사용자 ID 조건을 직접 겁니다. `supabase/server.ts`는 로그인 세션 전용(공개 키+쿠키), `supabase/proxy.ts`는 `src/proxy.ts`의 토큰 갱신.
- 여러 테이블을 함께 바꾸는 작업은 Postgres 함수(RPC)로만 합니다: `create_generation_job`(사용자 잠금→멱등키→잔액→작업+예약), `complete_generation_job`, `apply_payment_success`(결제 DONE→기간·회차→만료→지급), `end_subscription`(해지·만료+빌링키 제거+크레딧 만료, 이전 빌링키 암호문 반환), `expire_remaining_credits`, `credit_balance`, `acquire/release_billing_lock`. 모두 `security definer`, 실행 권한은 `service_role`만.
- `auth.ts`: Supabase Auth 이메일 매직링크·OTP. `getCurrentUser()`는 `connection()` → `getClaims()` → `profiles` 조회 순서입니다. `profiles`와 토스 `customerKey`(UUID)는 `auth.users` insert 트리거가 만듭니다. `devSignIn()`은 관리자 API `generateLink`로 메일 없이 로그인하며, `devLoginAllowed()`(테스트 키 + `next dev`)일 때만 로그인 화면에 노출합니다.
- `toss.ts`: 토스페이먼츠 서버 API 래퍼(빌링키 발급·자동결제 승인·빌링키 삭제). 시크릿 키 Basic 인증, 승인 요청에는 `orderId`를 `Idempotency-Key`로 보냅니다. `TOSS_API_BASE`로 모의 서버를 가리킬 수 있습니다. `isMockPayment()`는 `TOSS_SECRET_KEY`가 없을 때 참이며, 이때 토스 API 대신 서버 안의 모의 응답을 씁니다(빌링키 발급·승인·삭제, authKey `mock_auth_ok_…`/`mock_auth_fail_…`, fail 카드는 승인 때 `REJECT_CARD_PAYMENT`). `isTestMode()`는 가상 결제 모드이거나 시크릿 키가 `test_`로 시작하면 참입니다.
- `billing.ts`: 구독 도메인의 핵심.
  - `handleBillingAuthSuccess`: 결제창 successUrl 이후 빌링키 발급 → 구독 생성(`pending`) → 첫 결제. 이미 이용 중인 구독이 있으면 **결제 카드 변경**으로 처리합니다.
  - `chargeSubscription`: 스케줄러와 첫 결제가 공유. DB 잠금(`acquire_billing_lock` RPC, `billing_lock_until`)으로 동시 실행 방지, `orderId = sub_{구독ID}_c{회차}_a{시도}`, (구독, 회차)당 DONE 결제는 부분 유니크 인덱스로 하나만 허용. 네트워크 오류·5xx, 처리 중 중단된 `IN_PROGRESS`, 승인 후 DB 반영 실패는 모두 결과 미확정으로 보고 다음 실행 때 **같은 orderId로 재요청**합니다.
  - 실패 정책: 2회차 이상은 `past_due` → 1일, 3일 뒤 재시도 → 그래도 실패하면 `expired` + 빌링키 삭제 + 잔여 크레딧 만료. 첫 결제 실패는 바로 `expired`.
  - `runBillingScheduler`: 기간이 끝난 `cancel_at_period_end`를 `canceled`로 정리하고, `next_billing_at`이 지난 구독을 결제합니다.
  - `canGenerate(status)`: PRD 4.3의 상태별 생성 허용 기준(`active`, `cancel_at_period_end`만 허용).
- `credits.ts`: 잔액을 저장하지 않는 **원장(ledger)** 방식. 잔액 = `credit_ledger.amount` 합계. 유형은 `grant`(+), `reserve`(−), `release`(+), `consume`(0, 확정 기록), `expire`(−), `adjust`. 새 결제 회차에는 미사용분을 만료시키고 새로 지급합니다(이월 없음). 진행 중 작업의 예약분은 이미 잔액에서 빠져 있으므로 만료 계산에서 다시 빼지 않습니다(작업이 실패하면 `release`로 복구).
- `generation.ts`: 모의 AI 제공자. 생성 요청 시 서버에서 구독 상태·요금제 최대 길이·잔액을 검증하고, 폼의 `idempotencyKey`로 중복 생성을 막으며 크레딧을 예약합니다. 진행은 `advanceMockJobs()`가 **페이지 조회 시점**에 경과 시간으로 상태를 갱신합니다(대기 2초 → 생성 8초). 프롬프트에 `[실패]`가 있으면 실패하고 크레딧을 복구합니다. 실제 제공자 연동 시 이 모듈만 교체합니다.

### 라우트 (`web/src/app/`)

- 변경 작업은 `actions.ts`의 서버 액션이 처리하고, 결과는 `?msg=`/`?err=` 쿼리로 리다이렉트해 `components/Flash`가 표시합니다.
- `billing/success/route.ts`: 토스 결제창 successUrl(GET). 처리 후 즉시 `/subscription`으로 리다이렉트해 일회성 `authKey` 재사용을 막습니다. `billing/fail/page.tsx`는 failUrl.
- `api/cron/billing/route.ts`: 외부 cron용 `POST`, `Authorization: Bearer {CRON_SECRET}` 필요.
- `/dev`: 테스트 키일 때만 동작하는 도구(결제일을 지금으로 당기기, 스케줄러 즉시 실행). 한 달을 기다리지 않고 정기결제·해지 흐름을 확인할 때 씁니다.
- `billing/mock/page.tsx`: 가상 결제 모드 전용 결제창. 정상 카드·결제 실패 카드 중 고르면 토스 결제창과 같은 형식으로 `/billing/success`에 authKey를 넘깁니다. 가상 결제 모드가 아니면 `/plans`로 돌려보냅니다.
- `components/BillingButton.tsx`: `mock` prop(서버에서 `isMockPayment()` 전달)이면 `/billing/mock`으로 이동하고, 아니면 클라이언트에서 `@tosspayments/tosspayments-sdk`의 `requestBillingAuth({ method: "CARD" })`로 자동결제 등록창을 엽니다(클라이언트 키만 사용).

### 첫 화면과 디자인

- `globals.css` 하나에 디자인 토큰(다크 캔버스 + 빨강·보라·파랑 그라디언트 `--grad`)과 모든 스타일이 있습니다. 다크 테마 단일 구성입니다.
- `components/HeroDemo.tsx`: 프롬프트 타이핑 → 생성(블러가 걷힘) → 재생을 반복하는 데모. `components/AutoVideo.tsx`는 화면에 보일 때만 재생하고 `prefers-reduced-motion`이면 재생하지 않습니다.
- `web/public/videos/`의 예시 영상은 AI 결과물이 아닌 무료 스톡 영상(Mixkit Free License, Pixabay Content License)이므로 화면에 "AI 생성"이라고 표기하지 않습니다. 출처 목록은 `web/README.md`의 "영상 출처"에 있고, 영상을 추가·교체하면 그 표도 갱신합니다.
- `components/Scene.tsx`: CSS로 그린 장면. 지금은 내 영상 라이브러리의 모의 결과 미리보기에만 씁니다.

## Supabase 전환 (진행 중)

1단계(Database + RLS + RPC)와 2단계(Auth)는 코드에 반영되었습니다. 남은 순서는 Cron → Storage → Realtime·관리자이고 설계는 `PRD.md` 8.2~8.4, 7.7을 따릅니다. 지킬 점:

- 각 단계 후에도 아래 "결제 로직 검증 방법"의 시나리오가 그대로 통과해야 합니다.
- **DB 접근**: 쓰기는 서버의 `admin()` 클라이언트로만 합니다. 사용자 역할(`anon`/`authenticated`)에는 쓰기 정책·권한을 주지 않고, 새 컬럼을 `subscriptions`에 추가하면 `authenticated`의 컬럼 단위 select 권한 목록도 함께 손봅니다(`billing_key_enc`, `billing_lock_until`은 제외).
- **원자성**: supabase-js에는 트랜잭션이 없으므로, 두 개 이상의 쓰기가 함께 성공해야 하는 작업은 RPC로 만듭니다. 새 함수는 `security definer`, `set search_path = ''`, `public`/`anon`/`authenticated` 실행 권한 회수 후 `service_role`에만 부여합니다.
- 서버 코드에서 권한 판단에는 `getSession()`이 아니라 `getClaims()`/`getUser()`를 씁니다.
- 스키마를 바꾼 뒤에는 Supabase 보안 점검(`get_advisors`)으로 RLS 누락을 확인합니다.
- Cron은 `pg_cron` + `pg_net`으로 `POST https://videocreator-tau.vercel.app/api/cron/billing`(Bearer `CRON_SECRET`)을 매일 호출하도록 설정합니다(아직 미설정).
- 시크릿 키는 MCP로 가져올 수 없으므로 사용자가 대시보드에서 복사해 `web/.env.local`에 넣어야 합니다. 인증 메일 템플릿 변경, SMTP 연결도 대시보드 작업입니다.

## 배포 (Vercel)

- 사용자가 Vercel 대시보드에서 GitHub 저장소를 가져와 만든 프로젝트입니다. Root Directory는 `web`이고, `main`에 push하면 자동으로 다시 배포됩니다. push는 곧 배포이므로 사용자 확인을 받고 합니다.
- 환경변수는 Vercel **Settings → Environment Variables**에서 사용자가 직접 넣습니다. `NEXT_PUBLIC_*`는 **Config** 유형으로만 저장됩니다(Secret으로 고르면 Vercel이 막습니다). 나머지(`SUPABASE_SECRET_KEY`, `TOSS_SECRET_KEY`, `BILLING_KEY_SECRET`, `CRON_SECRET`)는 Secret입니다. `BILLING_KEY_SECRET`은 로컬과 같은 DB를 쓰므로 `.env.local`과 같은 값이어야 합니다.
- 지금 배포는 토스 키 없이 **가상 결제 모드**로 동작합니다. 그래도 `BILLING_KEY_SECRET`은 필요합니다(모의 빌링키도 암호화해 저장). 없으면 결제 시 `[CONFIG_ERROR]`가 표시되고, 빌링키 발급 전에 멈추므로 DB에는 아무것도 남지 않습니다. 실제 토스 테스트 키를 넣으면 가상 결제 모드는 자동으로 꺼집니다.
- `NEXT_PUBLIC_*`는 빌드할 때 코드에 박히므로, 환경변수를 바꾼 뒤에는 **Redeploy**해야 반영됩니다.
- 증상으로 원인 찾기: 모든 페이지가 500이고 `/api/cron/billing`만 401이면 proxy가 Supabase 공개 환경변수를 못 찾는 것입니다(cron 경로만 proxy matcher에서 빠져 있음). 첫 화면·로그인은 되고 요금제 화면만 오류면 `SUPABASE_SECRET_KEY`가 없거나 틀린 것입니다.
- 이 PC는 호스트 이름이 한글(`공군10전투비행단-PC03`)이라 `vercel login`이 `ByteString` 오류로 실패합니다. CLI가 필요하면 사용자가 만든 `VERCEL_TOKEN`으로 씁니다.
- Supabase **Authentication → URL Configuration**: Site URL은 `https://videocreator-tau.vercel.app`, Redirect URLs는 `https://videocreator-tau.vercel.app/**`, `http://localhost:3000/**`입니다. 허용 목록에 없는 주소로 로그인 링크를 요청하면 Supabase가 Site URL로 보냅니다. 도메인이 바뀌면 둘 다 고칩니다. 대시보드 설정은 MCP로 바꿀 수 없어서, 사용자가 브라우저 창에서 로그인한 뒤 바꿔야 합니다.
- 매직링크 메일 템플릿은 아직 기본값이라, 로그인 링크를 요청한 브라우저에서 열어야 로그인됩니다.
- Vercel 프로젝트는 `https://vercel.com/rohi12/videocreator`(환경변수: `/settings/environment-variables`, 배포 목록: `/deployments`)입니다. 사용자가 Chrome에 로그인해 있으면 Claude in Chrome으로 변수 이름 입력·저장·Redeploy까지 할 수 있지만, 비밀 값은 사용자가 직접 붙여 넣어야 합니다.
- 로컬 `.env.local`에는 `SUPABASE_SECRET_KEY`와 토스 키가 비어 있어 DB를 읽는 화면을 로컬에서 시험할 수 없습니다. 이런 흐름은 push 후 배포 사이트에서, 사용자가 로그인해 둔 Chrome으로 확인하고 `execute_sql`로 DB를 대조합니다.
- push 뒤 배포가 반영됐는지는 새 코드에만 있는 문구를 `curl`로 확인하면서 기다립니다(예: `curl -s https://videocreator-tau.vercel.app/ | grep -q "<새 문구>"`).

## 검색 노출 (SEO·AEO·GEO)

- 사이트 정보(주소, 제목·설명, 요금 요약, FAQ, 검색 콘솔 확인 토큰)는 `web/src/lib/site.ts` 한곳에서 관리합니다. `PLAN_SUMMARY`는 DB `plans` 시드와 같은 값이어야 하므로 요금을 바꾸면 둘 다 고칩니다. FAQ 문구는 첫 화면 "자주 묻는 질문", FAQPage JSON-LD, `/llms.txt`에 함께 쓰이므로 실제 정책과 어긋나지 않게 씁니다.
- `SITE_URL`은 `NEXT_PUBLIC_SITE_URL` → Vercel의 `VERCEL_PROJECT_PRODUCTION_URL` → localhost 순서로 정합니다.
- 공개 페이지는 `/`, `/plans`뿐입니다. 새 공개 페이지를 만들면 `app/sitemap.ts`에 넣고 페이지 `metadata`에 `alternates.canonical`을 지정합니다. 로그인 뒤 화면은 `robots: { index: false }`를 두고 `app/robots.ts`의 `PRIVATE`에 넣습니다.
- `app/opengraph-image.tsx`는 빌드 때 Google Fonts에서 필요한 글자만 담은 Noto Sans KR을 받아 그립니다(`"use cache"`는 글꼴 로더에만 둡니다. 함수 전체에 두면 `Response`를 직렬화하지 못해 빌드가 실패합니다).
- Google Search Console: URL 접두어 속성 `https://videocreator-tau.vercel.app/`, HTML 태그로 소유권 확인, `sitemap.xml` 제출 완료(2026-10-21). 확인 메타 태그를 지우면 소유권이 풀립니다.
- 네이버 서치어드바이저는 Claude in Chrome 안전 정책으로 접속이 막혀 있어 사용자가 직접 등록합니다. 받은 토큰을 `SITE_VERIFICATION.naver`에 넣고 배포하면 메타 태그가 붙습니다.
- 구조화 데이터 검증: `https://search.google.com/test/rich-results?url=<주소>`. "소프트웨어 앱"만 잡히는 것이 정상입니다(FAQ 리치 결과는 Google이 정부·보건 사이트에만 표시). `aggregateRating` 누락 경고는 실제 리뷰가 생기기 전까지 그대로 둡니다. 평점을 지어 넣지 않습니다.

## 결제 로직 검증 방법

실제 토스 테스트 키 없이 결제 로직을 확인할 때는 토스 API를 흉내 내는 로컬 모의 서버를 띄우고, 별도 포트의 dev 서버에 `TOSS_API_BASE=http://127.0.0.1:4010`, `TOSS_SECRET_KEY=test_sk_mock`을 주입해 `/billing/success?authKey=...&customerKey=<사용자 customer_key>&planId=basic`을 직접 호출합니다. 로그인은 로그인 화면의 **테스트 로그인**(dev 서버 + 테스트 키)으로 메일 없이 합니다. 이후 `/dev`에서 결제일 당기기와 스케줄러 실행을 반복하며 Supabase의 `subscriptions`, `payments`, `credit_ledger` 테이블을 `execute_sql`로 확인합니다. 테스트가 끝나면 테스트용 이메일의 `auth.users` 행을 지워 정리합니다(`profiles` 이하 데이터는 cascade로 함께 삭제). DB 함수만 확인할 때는 `execute_sql`로 테스트 사용자를 만들고 `assert`로 검증한 뒤 같은 블록에서 지우는 방식이 빠릅니다.

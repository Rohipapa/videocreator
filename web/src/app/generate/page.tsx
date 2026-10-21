import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "../components/Loading";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getBalance } from "@/lib/credits";
import { ASPECT_RATIOS, creditCost, DURATIONS, FAIL_TRIGGER, getGenerationAccess, TRIAL_CREDITS } from "@/lib/generation";
import { isTestMode } from "@/lib/toss";
import { createJobAction } from "../actions";
import { Flash } from "../components/Flash";
import { SubmitButton } from "../components/SubmitButton";

export const metadata: Metadata = { title: "동영상 만들기", robots: { index: false, follow: false } };

async function GeneratePageContent({ searchParams }: PageProps<"/generate">) {
  const { err } = await searchParams;
  const user = await requireUser();
  const access = await getGenerationAccess(user.id);
  const balance = await getBalance(user.id);
  const maxDuration = access.mode === "none" ? 0 : access.maxDuration;
  // 체험 크레딧을 다 쓰면 요금제 안내로 바꾼다.
  const trialUsedUp = access.mode === "trial" && balance < creditCost(DURATIONS[0]);

  return (
    <main className="narrow">
      <h1>동영상 만들기</h1>
      <Flash err={err} />
      {access.mode === "none" || trialUsedUp ? (
        <div className="card">
          <p>
            {trialUsedUp
              ? "무료 체험 크레딧을 모두 사용했어요. 요금제를 선택하면 매달 크레딧을 받아 계속 만들 수 있어요."
              : "동영상을 만들려면 이용 중인 구독이 필요합니다."}
          </p>
          <Link className="button" href="/plans">
            요금제 선택하기
          </Link>
        </div>
      ) : (
        <form action={createJobAction} className="stack card">
          {access.mode === "trial" && (
            <p className="trial-note">
              <strong>무료 체험 중</strong> · 가입 선물로 {TRIAL_CREDITS} 크레딧(10초 영상 {TRIAL_CREDITS / creditCost(10)}편)을 드렸어요. 프로
              요금제와 같은 조건으로 만들어 보세요.
            </p>
          )}
          {/* 요청마다 고유 키를 보내 버튼을 여러 번 눌러도 작업이 한 번만 생성되게 한다. */}
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
          <label>
            프롬프트
            <textarea
              name="prompt"
              required
              maxLength={1000}
              rows={5}
              placeholder="예: 들판을 가로질러 달리는 강아지, 슬로모션, 따뜻한 색감"
            />
          </label>
          <div className="row">
            <label>
              화면 비율
              <select name="aspectRatio" defaultValue="16:9">
                {ASPECT_RATIOS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              길이
              <select name="duration" defaultValue={String(maxDuration)}>
                {DURATIONS.filter((d) => d <= maxDuration).map((d) => (
                  <option key={d} value={d}>
                    {d}초 ({creditCost(d)} 크레딧)
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted small">
            남은 크레딧: <strong>{balance.toLocaleString("ko-KR")}</strong> · 생성 요청 시 크레딧이 예약되고, 시스템 오류로 실패하면 자동으로
            복구됩니다.
          </p>
          <p className="muted small">
            타인의 초상·저작물을 무단으로 사용하거나 불법·유해 콘텐츠를 만드는 것은 금지됩니다.
            {isTestMode() && <> (테스트: 프롬프트에 &quot;{FAIL_TRIGGER}&quot;를 넣으면 실패를 시뮬레이션합니다.)</>}
          </p>
          <p className="muted small">
            샘플 사이트라 실제 AI 대신, 프롬프트에 맞는 예시용 스톡 영상(강아지·전투기·자동차·바다·숲·설산 등)을 결과로 보여 드려요.
          </p>
          <SubmitButton label="생성하기" pendingLabel="요청 중…" />
        </form>
      )}
    </main>
  );
}

export default function GeneratePage(props: PageProps<"/generate">) {
  return (
    <Suspense fallback={<Loading />}>
      <GeneratePageContent {...props} />
    </Suspense>
  );
}

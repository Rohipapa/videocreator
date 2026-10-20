import { Suspense } from "react";
import { Loading } from "../components/Loading";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { canGenerate, getCurrentSubscription, getPlan } from "@/lib/billing";
import { getBalance } from "@/lib/credits";
import { ASPECT_RATIOS, creditCost, DURATIONS, FAIL_TRIGGER } from "@/lib/generation";
import { createJobAction } from "../actions";
import { Flash } from "../components/Flash";
import { SubmitButton } from "../components/SubmitButton";

async function GeneratePageContent({ searchParams }: PageProps<"/generate">) {
  const { err } = await searchParams;
  const user = await requireUser();
  const sub = await getCurrentSubscription(user.id);
  const plan = sub ? await getPlan(sub.plan_id) : undefined;
  const allowed = canGenerate(sub?.status);
  const balance = await getBalance(user.id);

  return (
    <main className="narrow">
      <h1>동영상 만들기</h1>
      <Flash err={err} />
      {!allowed ? (
        <div className="card">
          <p>동영상을 만들려면 이용 중인 구독이 필요합니다.</p>
          <Link className="button" href="/plans">
            요금제 선택하기
          </Link>
        </div>
      ) : (
        <form action={createJobAction} className="stack card">
          {/* 요청마다 고유 키를 보내 버튼을 여러 번 눌러도 작업이 한 번만 생성되게 한다. */}
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
          <label>
            프롬프트
            <textarea
              name="prompt"
              required
              maxLength={1000}
              rows={5}
              placeholder="예: 해 질 녘 바닷가를 달리는 골든 리트리버, 슬로모션, 따뜻한 색감"
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
              <select name="duration" defaultValue="5">
                {DURATIONS.filter((d) => d <= (plan?.max_duration ?? 0)).map((d) => (
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
            타인의 초상·저작물을 무단으로 사용하거나 불법·유해 콘텐츠를 만드는 것은 금지됩니다. (테스트: 프롬프트에 &quot;{FAIL_TRIGGER}&quot;를
            넣으면 실패를 시뮬레이션합니다.)
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

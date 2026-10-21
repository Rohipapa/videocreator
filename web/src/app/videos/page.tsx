import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "../components/Loading";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { advanceMockJobs, JOB_STATUS_LABEL, listJobs, mockResultVideo } from "@/lib/generation";
import { AutoRefresh } from "../components/AutoRefresh";
import { Flash } from "../components/Flash";
import { dateTime } from "../components/format";

export const metadata: Metadata = { title: "내 영상", robots: { index: false, follow: false } };

async function VideosPageContent({ searchParams }: PageProps<"/videos">) {
  const { msg, err, status } = await searchParams;
  const user = await requireUser();
  await advanceMockJobs(user.id);
  const all = await listJobs(user.id);
  const jobs = typeof status === "string" ? all.filter((j) => j.status === status) : all;
  const inFlight = all.some((j) => j.status === "queued" || j.status === "processing");

  return (
    <main>
      <AutoRefresh active={inFlight} />
      <div className="row between">
        <h1>내 영상</h1>
        <Link className="button" href="/generate">
          새로 만들기
        </Link>
      </div>
      <Flash msg={msg} err={err} />
      <nav className="filters" aria-label="상태 필터">
        <Link href="/videos" aria-current={!status ? "page" : undefined}>
          전체
        </Link>
        {(["processing", "completed", "failed"] as const).map((s) => (
          <Link key={s} href={`/videos?status=${s}`} aria-current={status === s ? "page" : undefined}>
            {JOB_STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>

      {jobs.length === 0 ? (
        <p className="muted">아직 만든 영상이 없습니다.</p>
      ) : (
        <div className="grid">
          {jobs.map((job) => (
            <article key={job.id} className="card video">
              <div className={`preview ratio-${job.aspect_ratio.replace(":", "x")} ${job.status}`}>
                {job.status === "completed" ? (
                  <>
                    <video src={`${mockResultVideo(job)}#t=0.1`} controls muted loop playsInline preload="metadata" />
                    <span className="sample-chip">예시용 스톡 영상</span>
                  </>
                ) : job.status === "failed" ? (
                  <span>생성 실패</span>
                ) : (
                  <span className="pulse">{JOB_STATUS_LABEL[job.status]}…</span>
                )}
              </div>
              <p className="prompt">{job.prompt}</p>
              <p className="muted small">
                <span className={`badge ${job.status}`}>{JOB_STATUS_LABEL[job.status]}</span> · {job.aspect_ratio} · {job.duration}초 ·{" "}
                {job.credits} 크레딧
              </p>
              {job.failure_reason && <p className="field-error">{job.failure_reason} — 크레딧이 복구되었습니다.</p>}
              <p className="muted small">요청: {dateTime(job.created_at)}</p>
              {job.status === "completed" && (
                <button className="button secondary" disabled title="샘플 사이트에서는 다운로드를 제공하지 않습니다">
                  다운로드 (실제 서비스에서 제공)
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

export default function VideosPage(props: PageProps<"/videos">) {
  return (
    <Suspense fallback={<Loading />}>
      <VideosPageContent {...props} />
    </Suspense>
  );
}

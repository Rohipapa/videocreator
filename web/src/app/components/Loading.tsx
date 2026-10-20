// 요청 시점 데이터(세션·DB)를 기다리는 동안 보여줄 자리 표시자
export function Loading() {
  return (
    <main>
      <p className="muted" role="status">
        불러오는 중…
      </p>
    </main>
  );
}

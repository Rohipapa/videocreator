// 서버 액션 이후 ?msg= / ?err= 로 전달된 안내 문구를 보여준다.
export function Flash({ msg, err }: { msg?: string | string[]; err?: string | string[] }) {
  if (typeof err === "string")
    return (
      <div className="alert error" role="alert">
        {err}
      </div>
    );
  if (typeof msg === "string")
    return (
      <div className="alert success" role="status">
        {msg}
      </div>
    );
  return null;
}

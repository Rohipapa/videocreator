export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export const dateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

export const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" }) : "-";

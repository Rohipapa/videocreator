"use client";

import { useFormStatus } from "react-dom";

// 제출 중에는 버튼을 비활성화해 중복 요청을 줄인다(서버에서도 멱등키로 막는다).
export function SubmitButton({ label, pendingLabel, className = "button" }: { label: string; pendingLabel: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

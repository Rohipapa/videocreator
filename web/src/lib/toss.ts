import "server-only";

// 토스페이먼츠 서버 API. 시크릿 키를 쓰므로 반드시 서버에서만 호출한다.
// TOSS_API_BASE는 로컬 모의 서버로 결제 로직을 검증할 때만 지정한다.
const API_BASE = process.env.TOSS_API_BASE || "https://api.tosspayments.com";

export class TossError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function authHeader(): string {
  const secret = process.env.TOSS_SECRET_KEY;
  if (!secret) throw new TossError("CONFIG_ERROR", "TOSS_SECRET_KEY 환경변수가 없습니다.", 500);
  // 시크릿 키 뒤에 콜론을 붙여 base64 인코딩한다.
  return "Basic " + Buffer.from(secret + ":").toString("base64");
}

export function isTestMode(): boolean {
  return (process.env.TOSS_SECRET_KEY ?? "").startsWith("test_");
}

async function call<T>(
  method: "POST" | "DELETE",
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: authHeader(),
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // 자동결제 승인은 최대 60초가 걸릴 수 있다.
      signal: AbortSignal.timeout(65_000),
      cache: "no-store",
    });
  } catch (e) {
    throw new TossError("NETWORK_ERROR", `토스페이먼츠 API 호출 실패: ${(e as Error).message}`, 0);
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new TossError(json.code ?? "UNKNOWN_ERROR", json.message ?? `HTTP ${res.status}`, res.status);
  }
  return json as T;
}

export type BillingAuthResult = {
  billingKey: string;
  customerKey: string;
  cardCompany?: string;
  cardNumber?: string;
  card?: { number?: string } | null;
};

export type PaymentResult = {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  approvedAt: string | null;
  receipt?: { url?: string } | null;
};

/** successUrl로 받은 authKey로 빌링키를 발급한다. */
export function issueBillingKey(authKey: string, customerKey: string) {
  return call<BillingAuthResult>("POST", "/v1/billing/authorizations/issue", { authKey, customerKey });
}

/** 빌링키로 자동결제를 승인한다. orderId를 멱등키로도 사용해 재시도 시 중복 결제를 막는다. */
export function approveBilling(
  billingKey: string,
  params: { customerKey: string; amount: number; orderId: string; orderName: string; customerEmail?: string },
) {
  return call<PaymentResult>("POST", `/v1/billing/${encodeURIComponent(billingKey)}`, params, params.orderId);
}

/** 더 이상 쓰지 않는 빌링키를 삭제한다. */
export function deleteBillingKey(billingKey: string) {
  return call<unknown>("DELETE", `/v1/billing/${encodeURIComponent(billingKey)}`);
}

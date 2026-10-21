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

/**
 * 가상 결제 모드: 토스 시크릿 키가 없으면 토스 API 대신 서버 안의 모의 응답을 쓴다.
 * 결제창도 내부 가상 결제창(/billing/mock)으로 바뀌고, 실제 결제는 일어나지 않는다.
 * 테스트 키나 라이브 키를 넣으면 자동으로 꺼진다.
 */
export function isMockPayment(): boolean {
  return !process.env.TOSS_SECRET_KEY;
}

export function isTestMode(): boolean {
  return isMockPayment() || (process.env.TOSS_SECRET_KEY ?? "").startsWith("test_");
}

/** 메일 없이 로그인하는 테스트 로그인 허용 여부: 테스트 키 + 개발 서버(next dev)일 때만. */
export function devLoginAllowed(): boolean {
  return isTestMode() && process.env.NODE_ENV === "development";
}

// ---- 가상 결제 모드의 모의 응답 ----
// 가상 결제창은 authKey에 카드 종류를 담아 보낸다(mock_auth_ok_… / mock_auth_fail_…).
// fail 카드로 만든 빌링키는 결제 승인 때 잔액 부족으로 거절된다.
const MOCK_PREFIX = { auth: "mock_auth_", billing: "mock_bk_" };

function mockCall<T>(method: "POST" | "DELETE", path: string, body?: unknown): T {
  const b = (body ?? {}) as Record<string, unknown>;
  if (method === "POST" && path === "/v1/billing/authorizations/issue") {
    const authKey = String(b.authKey ?? "");
    if (!authKey.startsWith(MOCK_PREFIX.auth)) throw new TossError("INVALID_AUTH_KEY", "가상 결제창에서 받은 인증 키가 아닙니다.", 400);
    const fail = authKey.startsWith(`${MOCK_PREFIX.auth}fail_`);
    return {
      billingKey: `${MOCK_PREFIX.billing}${fail ? "fail" : "ok"}_${crypto.randomUUID()}`,
      customerKey: b.customerKey,
      cardCompany: "가상카드",
      cardNumber: fail ? "40000000****999*" : "43301234****123*",
    } as T;
  }
  if (method === "POST" && path.startsWith("/v1/billing/")) {
    const billingKey = decodeURIComponent(path.slice("/v1/billing/".length));
    if (billingKey.startsWith(`${MOCK_PREFIX.billing}fail_`)) {
      throw new TossError("REJECT_CARD_PAYMENT", "잔액이 부족합니다. (가상 결제 실패 카드)", 403);
    }
    // 같은 orderId는 같은 paymentKey를 돌려준다(토스 멱등키 동작과 같게).
    return {
      paymentKey: `mock_pay_${b.orderId}`,
      orderId: b.orderId,
      status: "DONE",
      totalAmount: b.amount,
      approvedAt: new Date().toISOString(),
      receipt: null,
    } as T;
  }
  if (method === "DELETE") return {} as T;
  throw new TossError("NOT_FOUND", `가상 결제 모드에서 지원하지 않는 요청입니다: ${method} ${path}`, 404);
}

async function call<T>(
  method: "POST" | "DELETE",
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  if (isMockPayment()) return mockCall<T>(method, path, body);
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

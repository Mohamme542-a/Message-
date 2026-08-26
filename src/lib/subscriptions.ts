import { supabase } from "@/integrations/supabase/client";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 12;

type RpcError = { code?: string; message?: string } | null;

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return `AB-${Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("")}`;
}

function rpc(name: string, args: Record<string, unknown>) {
  return (supabase as unknown as {
    rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError }>;
  }).rpc(name, args);
}

function errorText(error: RpcError) {
  return `${error?.message ?? ""} ${error?.code ?? ""}`.toUpperCase();
}

export function subscriptionErrorMessage(error: unknown) {
  const text = errorText(error as RpcError);
  if (text.includes("ADMIN_REQUIRED") || text.includes("42501")) return "لا يملك الحساب الحالي صلاحية إنشاء أكواد الاشتراك.";
  if (text.includes("INVALID_SUBSCRIPTION_LIMIT")) return "تحقق من مدة الاشتراك وعدد مرات الاستخدام.";
  if (text.includes("INVALID_CODE_FORMAT")) return "تعذر إنشاء كود صالح؛ أعد المحاولة.";
  if (text.includes("23505") || text.includes("DUPLICATE")) return "حدث تعارض نادر في الكود؛ أعد المحاولة.";
  if (text.includes("JWT") || text.includes("AUTH")) return "انتهت جلسة الإدارة؛ سجّل الدخول ثم أعد المحاولة.";
  return "تعذر إنشاء الكود الآن. تحقق من الاتصال ثم أعد المحاولة.";
}

export async function createSubscriptionCode(durationDays: number, maxRedemptions = 1, expiresAt?: string | null) {
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 366) throw new Error("INVALID_SUBSCRIPTION_LIMIT");
  if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 10000) throw new Error("INVALID_SUBSCRIPTION_LIMIT");

  let lastError: RpcError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = newCode();
    const { data, error } = await rpc("create_subscription_code", {
      _code: code,
      _duration_days: durationDays,
      _max_redemptions: maxRedemptions,
      _expires_at: expiresAt ?? null,
    });
    const result = Array.isArray(data) ? data[0] : data;
    if (!error && result && typeof result === "object" && "code" in result) {
      return result as { code: string; durationDays: number; maxRedemptions: number };
    }
    lastError = error;
    if (!errorText(error).includes("23505") && !errorText(error).includes("DUPLICATE")) break;
  }
  throw lastError ?? new Error("SUBSCRIPTION_CODE_CREATE_FAILED");
}

export async function redeemSubscriptionCode(code: string) {
  const { data, error } = await rpc("redeem_subscription_code", { _code: code.trim().toUpperCase() });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result || typeof result !== "object") throw new Error("SUBSCRIPTION_CODE_REDEEM_EMPTY");
  return result as { premiumUntil: string; durationDays: number };
}

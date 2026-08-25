import { supabase } from "@/integrations/supabase/client";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `AB-${Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("")}`;
}

function rpc(name: string, args: Record<string, unknown>) {
  return (supabase as unknown as {
    rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  }).rpc(name, args);
}

export async function createSubscriptionCode(durationDays: number, maxRedemptions = 1, expiresAt?: string | null) {
  const code = newCode();
  const { data, error } = await rpc("create_subscription_code", {
    _code: code,
    _duration_days: durationDays,
    _max_redemptions: maxRedemptions,
    _expires_at: expiresAt ?? null,
  });
  if (error) throw error;
  return data as { code: string; durationDays: number; maxRedemptions: number };
}

export async function redeemSubscriptionCode(code: string) {
  const { data, error } = await rpc("redeem_subscription_code", { _code: code });
  if (error) throw error;
  return data as { premiumUntil: string; durationDays: number };
}

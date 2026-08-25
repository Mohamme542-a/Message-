import { supabase } from "@/integrations/supabase/client";

export interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  identity_public_key: string | null;
  status: string;
  last_seen: string;
  show_online: boolean;
  show_last_seen: boolean;
  read_receipts: boolean;
  typing_indicator: boolean;
  private_notifications: boolean;
}

export async function getConfig<T>(key: string, fallback: T): Promise<T> {
  const { data } = await supabase.from("app_config").select("value").eq("key", key).maybeSingle();
  return (data?.value as T | undefined) ?? fallback;
}

export async function getMyProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

export async function findProfileByUsername(username: string) {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();
  return data as ProfileRow | null;
}

export async function listConversations(userId: string) {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function ensureConversation(a: string, b: string) {
  const sorted = [a, b].sort();
  const user_a = sorted[0] as string;
  const user_b = sorted[1] as string;

  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_a", user_a)
    .eq("user_b", user_b)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_a, user_b })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listMessages(conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function hasRole(userId: string, role: "admin" | "moderator") {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();
  return Boolean(data);
}

export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@ab.local`;
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

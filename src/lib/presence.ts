import { supabase } from "@/integrations/supabase/client";

export type PresenceProfile = {
  last_seen: string | null;
  show_online?: boolean;
  show_last_seen?: boolean;
};

export function isOnline(profile: PresenceProfile | null | undefined) {
  if (!profile?.show_online || !profile.last_seen) return false;
  return Date.now() - new Date(profile.last_seen).getTime() < 90_000;
}

export function formatLastSeen(profile: PresenceProfile | null | undefined) {
  if (!profile?.show_last_seen || !profile.last_seen) return "آخر ظهور غير متاح";
  if (isOnline(profile)) return "متصل الآن";
  const date = new Date(profile.last_seen);
  const diff = Math.max(0, Date.now() - date.getTime());
  if (diff < 3_600_000) return `آخر نشاط منذ ${Math.max(1, Math.floor(diff / 60_000))} دقيقة`;
  if (diff < 86_400_000) return `آخر نشاط اليوم ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return `آخر نشاط ${date.toLocaleDateString()}`;
}

export async function writePresence(userId: string, online: boolean) {
  if (!userId) return;
  const profilesTable = (supabase as unknown as { from: (table: string) => any }).from("profiles");
  await profilesTable.update({ last_seen: new Date().toISOString() }).eq("id", userId);
  if (!online) return;
}

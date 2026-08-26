import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Ban, Flag, MessageCircle, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { ensureConversation } from "@/lib/ab-api";
import { formatLastSeen, isOnline } from "@/lib/presence";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/profile/$id")({
  ssr: false,
  component: ProfilePage,
});

function ProfilePage() {
  const { id } = Route.useParams();
  const { session } = useSession();
  const userId = session?.user.id ?? "";

  const { data: profile, isLoading } = useQuery({
    queryKey: ["public-profile", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const profiles = (supabase as unknown as { from: (table: string) => any }).from("profiles");
      const { data, error } = await profiles.select("id, username, display_name, bio, avatar_url, is_verified, last_seen, show_online, show_last_seen, status").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as { id: string; username: string; display_name: string; bio: string; avatar_url: string | null; is_verified: boolean; last_seen: string | null; show_online: boolean; show_last_seen: boolean; status: string } | null;
    },
  });

  async function startConversation() {
    if (!userId || !profile || profile.id === userId) return;
    try {
      const conversation = await ensureConversation(userId, profile.id);
      window.location.assign(`/chat/${conversation.id}`);
    } catch {
      toast.error("تعذر فتح المحادثة الآن.");
    }
  }

  async function block() {
    if (!userId || !profile) return;
    const { error } = await supabase.from("blocks").insert({ blocker_id: userId, blocked_id: profile.id });
    if (error) toast.error("تعذر حظر الحساب.");
    else toast.success("تم حظر الحساب.");
  }

  async function report() {
    if (!userId || !profile) return;
    const { error } = await supabase.from("reports").insert({ reporter_id: userId, reported_user_id: profile.id, reason: "profile" });
    if (error) toast.error("تعذر إرسال البلاغ.");
    else toast.success("تم إرسال البلاغ.");
  }

  if (isLoading) return <div className="page-scroll mx-auto max-w-lg p-6 text-center text-sm text-muted-foreground">جارٍ فتح الملف…</div>;
  if (!profile) return <div className="page-scroll mx-auto max-w-lg p-6 text-center text-sm text-muted-foreground">الملف غير متاح.</div>;

  return (
    <div className="page-scroll mx-auto max-w-lg bg-background pb-8">
      <header className="safe-top flex items-center px-4 py-3"><Link to="/chats" className="rounded-full p-2 text-muted-foreground press" aria-label="رجوع"><ArrowRight className="h-5 w-5" /></Link><span className="ms-3 text-sm font-semibold">الملف الشخصي</span></header>
      <section className="px-5 pb-5 pt-6 text-center">
        {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="mx-auto h-28 w-28 rounded-[2rem] object-cover shadow-lg" /> : <span className="mx-auto flex h-28 w-28 items-center justify-center rounded-[2rem] brand-bg text-3xl font-bold text-primary-foreground shadow-lg">{(profile.display_name || profile.username || "?").slice(0, 2).toUpperCase()}</span>}
        <div className="mt-4 flex items-center justify-center gap-2"><h1 className="text-xl font-bold">{profile.display_name || profile.username}</h1>{profile.is_verified && <VerifiedBadge className="h-5 w-5" />}</div>
        <p className="mt-1 text-sm text-muted-foreground">@{profile.username}</p>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><span className={isOnline(profile) ? "h-2 w-2 rounded-full bg-emerald-500" : "h-2 w-2 rounded-full bg-muted-foreground/50"} />{formatLastSeen(profile)}</p>
      </section>
      {profile.id !== userId && <section className="mx-4 grid grid-cols-3 gap-2"><Button className="h-11 gap-1.5" onClick={() => void startConversation()}><MessageCircle className="h-4 w-4" />مراسلة</Button><Button variant="outline" className="h-11" onClick={() => void block()} aria-label="حظر"><Ban className="h-4 w-4" /></Button><Button variant="outline" className="h-11" onClick={() => void report()} aria-label="إبلاغ"><Flag className="h-4 w-4" /></Button></section>}
      <section className="mx-4 mt-5 overflow-hidden rounded-3xl border border-border glass"><div className="flex items-start gap-3 px-4 py-4"><UserRound className="mt-0.5 h-5 w-5 text-primary" /><div className="min-w-0"><p className="text-sm font-semibold">نبذة</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{profile.bio?.trim() || "—"}</p></div></div><div className="border-t border-border px-4 py-4"><p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" />الحساب</p><p className="mt-1 text-xs text-muted-foreground">حالة الحساب: {profile.status === "active" ? "نشط" : "غير متاح"}</p></div></section>
    </div>
  );
}

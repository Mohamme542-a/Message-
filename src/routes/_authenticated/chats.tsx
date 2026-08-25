import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Lock, Plus, Search, ShieldCheck, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { decryptWithKey, deriveConversationKey } from "@/lib/crypto";
import { listConversations } from "@/lib/ab-api";
import { createGroup, listMyGroups, type GroupKind } from "@/lib/groups";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { VerifiedBadge } from "@/components/VerifiedBadge";

export const Route = createFileRoute("/_authenticated/chats")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "المحادثات — Alpha Byte" },
      { name: "description", content: "كل محادثاتك في Alpha Byte مشفّرة من طرف إلى طرف على جهازك." },
      { property: "og:title", content: "المحادثات — Alpha Byte" },
      { property: "og:description", content: "محادثات Alpha Byte المشفّرة من طرف إلى طرف." },
    ],
  }),
  component: ChatsPage,
});

function ChatsPage() {
  const { t } = useI18n();
  const { session, vault } = useSession();
  const userId = session?.user.id ?? "";
  const [query, setQuery] = useState("");
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupKind, setGroupKind] = useState<GroupKind>("group");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["conversations", userId],
    enabled: Boolean(userId && vault),
    queryFn: async () => {
      const conversations = await listConversations(userId);
      const peerIds = conversations.map((c) => (c.user_a === userId ? c.user_b : c.user_a));
      if (peerIds.length === 0) return [];
      const profilesTable = (supabase as unknown as { from: (table: string) => any }).from("profiles");
      const { data: profileData } = await profilesTable
        .select("id, username, display_name, avatar_url, is_verified, last_seen, show_online, identity_public_key")
        .in("id", peerIds);
      const profiles = profileData as Array<{ id: string; username: string; display_name: string; avatar_url: string | null; is_verified: boolean; identity_public_key: string | null }> | null;
      const rows = await Promise.all(conversations.map(async (conversation) => {
        const peer = profiles?.find((profile) => profile.id === (conversation.user_a === userId ? conversation.user_b : conversation.user_a)) ?? null;
        const { data: latest } = await supabase
          .from("messages")
          .select("encrypted_payload, iv, kind, created_at")
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        let preview = `@${peer?.username ?? "—"}`;
        if (latest && peer?.identity_public_key && vault) {
          try {
            const key = await deriveConversationKey(vault.identityPrivateKey, peer.identity_public_key, conversation.id);
            const decoded = await decryptWithKey(key, { ciphertext: latest.encrypted_payload, iv: latest.iv });
            if (latest.kind === "image") preview = "صورة مشفّرة";
            else if (latest.kind === "audio") preview = "رسالة صوتية";
            else if (latest.kind === "file") preview = "ملف مشفّر";
            else preview = decoded;
          } catch { preview = "رسالة مشفّرة"; }
        }
        return { conversation, peer, latest, preview };
      }));
      return rows.sort((a, b) => (b.latest?.created_at ?? b.conversation.updated_at).localeCompare(a.latest?.created_at ?? a.conversation.updated_at));
    },
  });

  const { data: groupRows } = useQuery({
    queryKey: ["groups", userId],
    enabled: Boolean(userId),
    queryFn: () => listMyGroups(userId),
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`conversation-previews:${userId}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages" },
      () => void queryClient.invalidateQueries({ queryKey: ["conversations", userId] }),
    ).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient, userId]);

  const rows = useMemo(() => {
    const list = data ?? [];
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter(
      (r) =>
        r.peer?.username.toLowerCase().includes(q) ||
        (r.peer?.display_name ?? "").toLowerCase().includes(q),
    );
  }, [data, query]);

  async function handleCreateGroup() {
    if (!vault || !groupTitle.trim() || creatingGroup) return;
    setCreatingGroup(true);
    try {
      await createGroup(vault.identityPrivateKey, vault.identityPublicKey, {
        title: groupTitle.trim(),
        description: groupDescription.trim(),
        kind: groupKind,
      });
      setGroupDialogOpen(false);
      setGroupTitle("");
      setGroupDescription("");
      await queryClient.invalidateQueries({ queryKey: ["groups", userId] });
    } finally {
      setCreatingGroup(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0"><h1 className="text-2xl font-bold">{t("chats.title")}</h1><span className="mt-1 flex w-fit items-center gap-1 text-[11px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" />{t("chat.encrypted")}</span></div>
        <Button type="button" size="icon" className="shrink-0 rounded-2xl" onClick={() => setGroupDialogOpen(true)} aria-label="إنشاء مجموعة أو قناة"><Plus className="h-5 w-5" /></Button>
      </header>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("chats.search")}
          className="pe-9"
        />
      </div>

      {(groupRows ?? []).length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-xs font-semibold text-muted-foreground">المجموعات والقنوات</h2>
          <ul className="space-y-2">
            {(groupRows ?? []).map(({ group, role }) => (
              <li key={group.id}><Link to="/group/$id" params={{ id: group.id }} className="flex items-center gap-3 rounded-2xl border border-border glass px-4 py-3 press">
                {group.avatar_url ? <img src={group.avatar_url} alt="" className="h-11 w-11 rounded-2xl object-cover" /> : <span className="flex h-11 w-11 items-center justify-center rounded-2xl brand-bg text-primary-foreground"><Users className="h-5 w-5" /></span>}
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{group.title}</span><span className="block truncate text-xs text-muted-foreground">{group.kind === "channel" ? "قناة" : "مجموعة"} · {role === "owner" ? "المالك" : role === "admin" ? "مشرف" : "عضو"}</span></span>
              </Link></li>
            ))}
          </ul>
        </section>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl border border-border glass p-8 text-center">
          <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-semibold">{t("chats.empty")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("chats.empty.hint")}</p>
          <Link to="/contacts" className="mt-4 inline-block text-sm text-primary underline">
            {t("contacts.title")}
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ conversation, peer, latest, preview }) => (
            <li key={conversation.id}>
              <Link
                to="/chat/$id"
                params={{ id: conversation.id }}
                className="flex items-center gap-3 rounded-2xl border border-border glass px-4 py-3 press"
              >
                {peer?.avatar_url ? <img src={peer.avatar_url} alt="" className="h-11 w-11 rounded-2xl object-cover" /> : <span className="flex h-11 w-11 items-center justify-center rounded-2xl brand-bg text-sm font-bold text-primary-foreground">{(peer?.display_name || peer?.username || "?").slice(0, 2).toUpperCase()}</span>}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 truncate font-semibold">{peer?.display_name || peer?.username || "—"}{peer?.is_verified ? <VerifiedBadge className="text-sm" /> : null}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {preview}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1"><Lock className="h-4 w-4 text-primary" />{latest && <span className="text-[10px] text-muted-foreground">{new Date(latest.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent dir="rtl" className="max-w-sm rounded-3xl">
          <DialogHeader><DialogTitle>إنشاء مساحة جديدة</DialogTitle><DialogDescription>اختر مجموعة للنقاش أو قناة للنشر من الإدارة.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-2"><Button type="button" variant={groupKind === "group" ? "default" : "outline"} onClick={() => setGroupKind("group")}>مجموعة</Button><Button type="button" variant={groupKind === "channel" ? "default" : "outline"} onClick={() => setGroupKind("channel")}>قناة</Button></div>
          <Input value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} maxLength={70} placeholder="الاسم" />
          <Textarea value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} maxLength={512} rows={3} placeholder="الوصف (اختياري)" />
          <DialogFooter><Button className="w-full" disabled={!groupTitle.trim() || creatingGroup} onClick={() => void handleCreateGroup()}>{creatingGroup ? "جارٍ الإنشاء" : "إنشاء"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

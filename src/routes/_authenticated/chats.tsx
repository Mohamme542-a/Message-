import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Lock, Search, ShieldCheck } from "lucide-react";

import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { listConversations } from "@/lib/ab-api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

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
  const { session } = useSession();
  const userId = session?.user.id ?? "";
  const [query, setQuery] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["conversations", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const conversations = await listConversations(userId);
      const peerIds = conversations.map((c) => (c.user_a === userId ? c.user_b : c.user_a));
      if (peerIds.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, last_seen, show_online")
        .in("id", peerIds);
      return conversations.map((c) => ({
        conversation: c,
        peer: profiles?.find((p) => p.id === (c.user_a === userId ? c.user_b : c.user_a)) ?? null,
      }));
    },
  });

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

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("chats.title")}</h1>
        <span className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          {t("chat.encrypted")}
        </span>
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
          {rows.map(({ conversation, peer }) => (
            <li key={conversation.id}>
              <Link
                to="/chat/$id"
                params={{ id: conversation.id }}
                className="flex items-center gap-3 rounded-2xl border border-border glass px-4 py-3 press"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl brand-bg text-sm font-bold text-primary-foreground">
                  {(peer?.display_name || peer?.username || "?").slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {peer?.display_name || peer?.username || "—"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    @{peer?.username ?? "—"}
                  </span>
                </span>
                <Lock className="h-4 w-4 text-primary" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Lock, Send, ShieldCheck, Timer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { decryptWithKey, deriveConversationKey, encryptWithKey } from "@/lib/crypto";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "محادثة مشفّرة — Alpha Byte" },
      { name: "description", content: "محادثة Alpha Byte مشفّرة من طرف إلى طرف؛ الخادم يخزّن النص المشفّر فقط." },
      { property: "og:title", content: "محادثة مشفّرة — Alpha Byte" },
      { property: "og:description", content: "محادثة Alpha Byte مشفّرة من طرف إلى طرف." },
    ],
  }),
  component: ChatPage,
});

interface Row {
  id: string;
  sender_id: string;
  encrypted_payload: string;
  iv: string;
  created_at: string;
  expires_at: string | null;
}

const TTL_OPTIONS = [0, 10, 60, 3600, 86400, 604800];

function ttlLabel(seconds: number, t: ReturnType<typeof useI18n>["t"]) {
  switch (seconds) {
    case 10:
      return t("disappearing.10s");
    case 60:
      return t("disappearing.1m");
    case 3600:
      return t("disappearing.1h");
    case 86400:
      return t("disappearing.1d");
    case 604800:
      return t("disappearing.1w");
    default:
      return t("disappearing.off");
  }
}

function ChatPage() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { session, vault } = useSession();
  const userId = session?.user.id ?? "";

  const [peer, setPeer] = useState<{ id: string; username: string; display_name: string; identity_public_key: string | null } | null>(null);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [plain, setPlain] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [ttl, setTtl] = useState(0);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!userId || !vault) return;
      const { data: conv } = await supabase.from("conversations").select("*").eq("id", id).maybeSingle();
      if (!conv) {
        navigate({ to: "/chats", replace: true });
        return;
      }
      if (!cancelled) setTtl(conv.disappearing_seconds ?? 0);
      const peerId = conv.user_a === userId ? conv.user_b : conv.user_a;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, username, display_name, identity_public_key")
        .eq("id", peerId)
        .maybeSingle();
      if (cancelled) return;
      setPeer(profile ?? null);
      if (profile?.identity_public_key) {
        try {
          setKey(await deriveConversationKey(vault.identityPrivateKey, profile.identity_public_key, id));
        } catch {
          setKey(null);
        }
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [id, userId, vault, navigate]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    async function load() {
      const { data } = await supabase
        .from("messages")
        .select("id, sender_id, encrypted_payload, iv, created_at, expires_at")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });
      if (active) setRows((data as Row[] | null) ?? []);
    }
    void load();
    const channel = supabase
      .channel(`messages:${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [id, userId]);

  const visible = useMemo(
    () => rows.filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > Date.now()),
    [rows],
  );

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const row of visible) {
        try {
          next[row.id] = await decryptWithKey(key, {
            ciphertext: row.encrypted_payload,
            iv: row.iv,
          });
        } catch {
          next[row.id] = t("chat.decryptFailed");
        }
      }
      if (!cancelled) setPlain(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [key, visible, t]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [plain]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || !key) return;
    setSending(true);
    try {
      const payload = await encryptWithKey(key, draft.trim());
      const { error } = await supabase.from("messages").insert({
        conversation_id: id,
        sender_id: userId,
        encrypted_payload: payload.ciphertext,
        iv: payload.iv,
        expires_at: ttl > 0 ? new Date(Date.now() + ttl * 1000).toISOString() : null,
      });
      if (error) throw error;
      setDraft("");
    } catch {
      toast.error(t("common.error"));
    } finally {
      setSending(false);
    }
  }

  async function updateTtl(seconds: number) {
    setTtl(seconds);
    await supabase.from("conversations").update({ disappearing_seconds: seconds }).eq("id", id);
  }

  async function removeMessage(messageId: string) {
    await supabase.from("messages").delete().eq("id", messageId);
    setRows((prev) => prev.filter((r) => r.id !== messageId));
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border glass px-4 py-3">
        <Link to="/chats" className="rounded-full p-1.5 text-muted-foreground press">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl brand-bg text-xs font-bold text-primary-foreground">
          {(peer?.display_name || peer?.username || "?").slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{peer?.display_name || peer?.username || "—"}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" />
            {t("chat.encrypted")}
          </p>
        </div>
        <Link
          to="/security/$id"
          params={{ id }}
          className="rounded-full p-1.5 text-primary press"
          aria-label={t("chat.security")}
        >
          <ShieldCheck className="h-5 w-5" />
        </Link>
      </header>

      <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
        <Timer className="h-3.5 w-3.5" />
        <span className="whitespace-nowrap">{t("chat.disappearing")}</span>
        <Select value={String(ttl)} onValueChange={(v) => void updateTtl(Number(v))}>
          <SelectTrigger className="h-7 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TTL_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {ttlLabel(option, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {!key && (
          <p className="rounded-2xl border border-border bg-muted/40 p-3 text-center text-xs text-muted-foreground">
            {t("chat.decryptFailed")}
          </p>
        )}
        {visible.map((row) => {
          const mine = row.sender_id === userId;
          return (
            <div key={row.id} className={cn("flex", mine ? "justify-start" : "justify-end")}>
              <div
                className={cn(
                  "group max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                  mine ? "brand-bg text-primary-foreground" : "border border-border glass",
                )}
              >
                <p className="whitespace-pre-wrap break-words">{plain[row.id] ?? "…"}</p>
                <div className="mt-1 flex items-center gap-2 text-[10px] opacity-70">
                  <span>
                    {new Date(row.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {row.expires_at && <Timer className="h-3 w-3" />}
                  {mine && (
                    <button
                      type="button"
                      onClick={() => void removeMessage(row.id)}
                      aria-label={t("chat.delete")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="sticky bottom-0 flex gap-2 border-t border-border glass px-4 py-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("chat.placeholder")}
          disabled={!key}
        />
        <Button type="submit" size="icon" className="press" disabled={sending || !draft.trim() || !key}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

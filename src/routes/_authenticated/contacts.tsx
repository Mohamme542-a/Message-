import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Ban, Flag, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { ensureConversation, findProfileByUsername, type ProfileRow } from "@/lib/ab-api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/contacts")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "جهات الاتصال — AB" },
      { name: "description", content: "ابحث باسم المستخدم وأرسل طلبات محادثة؛ AB لا يرفع دفتر هاتفك." },
      { property: "og:title", content: "جهات الاتصال — AB" },
      { property: "og:description", content: "بحث باسم المستخدم فقط في AB." },
    ],
  }),
  component: ContactsPage,
});

function ContactsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id ?? "";

  const [term, setTerm] = useState("");
  const [found, setFound] = useState<ProfileRow | null | "none">(null);
  const [busy, setBusy] = useState(false);

  const { data: requests } = useQuery({
    queryKey: ["requests", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data } = await supabase
        .from("contact_requests")
        .select("*")
        .eq("recipient_id", userId)
        .eq("status", "pending");
      const senderIds = (data ?? []).map((r) => r.sender_id);
      const { data: profiles } = senderIds.length
        ? await supabase.from("profiles").select("id, username, display_name").in("id", senderIds)
        : { data: [] };
      return (data ?? []).map((r) => ({
        request: r,
        sender: profiles?.find((p) => p.id === r.sender_id) ?? null,
      }));
    },
  });

  async function search() {
    setBusy(true);
    try {
      const profile = await findProfileByUsername(term);
      setFound(profile && profile.id !== userId ? profile : "none");
    } finally {
      setBusy(false);
    }
  }

  async function sendRequest(recipientId: string) {
    const { error } = await supabase
      .from("contact_requests")
      .insert({ sender_id: userId, recipient_id: recipientId });
    if (error) toast.error(t("common.error"));
    else toast.success(t("contacts.sent"));
  }

  async function respond(requestId: string, senderId: string, accept: boolean) {
    const { error } = await supabase
      .from("contact_requests")
      .update({ status: accept ? "accepted" : "rejected" })
      .eq("id", requestId);
    if (error) {
      toast.error(t("common.error"));
      return;
    }
    if (accept) {
      const conversation = await ensureConversation(userId, senderId);
      await queryClient.invalidateQueries({ queryKey: ["conversations", userId] });
      navigate({ to: "/chat/$id", params: { id: conversation.id } });
    }
    await queryClient.invalidateQueries({ queryKey: ["requests", userId] });
  }

  async function block(targetId: string) {
    const { error } = await supabase
      .from("blocks")
      .insert({ blocker_id: userId, blocked_id: targetId });
    if (error) toast.error(t("common.error"));
    else toast.success(t("contacts.block"));
  }

  async function report(targetId: string) {
    const { error } = await supabase
      .from("reports")
      .insert({ reporter_id: userId, reported_user_id: targetId, reason: "abuse" });
    if (error) toast.error(t("common.error"));
    else toast.success(t("contacts.report"));
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <h1 className="mb-1 text-2xl font-bold">{t("contacts.title")}</h1>
      <p className="mb-4 text-xs text-muted-foreground">{t("contacts.noUpload")}</p>

      <div className="flex gap-2">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t("contacts.search")}
          onKeyDown={(e) => e.key === "Enter" && void search()}
        />
        <Button onClick={() => void search()} disabled={busy || !term.trim()} className="press">
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {found === "none" && (
        <p className="mt-4 rounded-2xl border border-border p-4 text-center text-sm text-muted-foreground">
          {t("contacts.none")}
        </p>
      )}

      {found && found !== "none" && (
        <div className="mt-4 rounded-2xl border border-border glass p-4">
          <p className="font-semibold">{found.display_name || found.username}</p>
          <p className="text-xs text-muted-foreground">@{found.username}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" className="press" onClick={() => void sendRequest(found.id)}>
              <UserPlus className="me-1 h-4 w-4" />
              {t("contacts.send")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void block(found.id)}>
              <Ban className="me-1 h-4 w-4" />
              {t("contacts.block")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void report(found.id)}>
              <Flag className="me-1 h-4 w-4" />
              {t("contacts.report")}
            </Button>
          </div>
        </div>
      )}

      <h2 className="mt-8 mb-3 text-sm font-semibold text-muted-foreground">
        {t("contacts.requests")}
      </h2>
      <ul className="space-y-2">
        {(requests ?? []).map(({ request, sender }) => (
          <li
            key={request.id}
            className="flex items-center gap-3 rounded-2xl border border-border glass px-4 py-3"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {sender?.display_name || sender?.username || "—"}
              </span>
              <span className="block text-xs text-muted-foreground">@{sender?.username ?? "—"}</span>
            </span>
            <Button size="sm" onClick={() => void respond(request.id, request.sender_id, true)}>
              {t("contacts.accept")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void respond(request.id, request.sender_id, false)}
            >
              {t("contacts.reject")}
            </Button>
          </li>
        ))}
        {(requests ?? []).length === 0 && (
          <li className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            —
          </li>
        )}
      </ul>
    </div>
  );
}

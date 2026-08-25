import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Download,
  FileText,
  Image as ImageIcon,
  Lock,
  Mic,
  Paperclip,
  Pause,
  Play,
  Send,
  ShieldCheck,
  Square,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";

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
import {
  downloadDecryptedAttachment,
  isAttachmentDescriptor,
  uploadEncryptedAttachment,
  type AttachmentDescriptor,
} from "@/lib/attachments";
import { decryptWithKey, deriveConversationKey, encryptWithKey } from "@/lib/crypto";
import { useI18n } from "@/lib/i18n";
import { notifyPeerOfNewMessage } from "@/lib/push-notifications";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "محادثة مشفّرة — Alpha Byte" },
      { name: "description", content: "محادثة Alpha Byte مشفّرة من طرف إلى طرف؛ الخادم يخزّن النص والملفات مشفّرة فقط." },
    ],
  }),
  component: ChatPage,
});

interface Row {
  id: string;
  sender_id: string;
  encrypted_payload: string;
  iv: string;
  kind: string;
  created_at: string;
  expires_at: string | null;
}

const TTL_OPTIONS = [0, 10, 60, 3600, 86400, 604800];

function ttlLabel(seconds: number, t: ReturnType<typeof useI18n>["t"]) {
  switch (seconds) {
    case 10: return t("disappearing.10s");
    case 60: return t("disappearing.1m");
    case 3600: return t("disappearing.1h");
    case 86400: return t("disappearing.1d");
    case 604800: return t("disappearing.1w");
    default: return t("disappearing.off");
  }
}

function AttachmentPreview({ descriptor }: { descriptor: AttachmentDescriptor }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  useEffect(() => {
    if (descriptor.kind !== "audio" || !url || !autoplay) return;
    const audio = audioRef.current;
    if (!audio) return;
    void audio.play().then(() => setPlaying(true)).catch(() => setAutoplay(false));
  }, [autoplay, descriptor.kind, url]);

  async function openAttachment() {
    setLoading(true);
    try {
      const blob = await downloadDecryptedAttachment(descriptor);
      const nextUrl = URL.createObjectURL(blob);
      setUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return nextUrl;
      });
      if (descriptor.kind === "audio") setAutoplay(true);
    } catch {
      toast.error("تعذر فتح المرفق المشفّر.");
    } finally {
      setLoading(false);
    }
  }

  if (descriptor.kind === "image" && url) {
    return <img src={url} alt={descriptor.name} className="max-h-72 w-full rounded-xl object-cover" />;
  }
  if (descriptor.kind === "audio" && url) {
    return (
      <div className="flex min-w-52 items-center gap-2">
        <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 rounded-full"
          onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            if (audio.paused) void audio.play();
            else audio.pause();
          }}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "إيقاف" : "تشغيل"}
        </Button>
        <span className="min-w-0 flex-1 truncate text-xs">{descriptor.name}</span>
        <a href={url} download={descriptor.name} className="rounded-full p-1" aria-label="تنزيل المرفق"><Download className="h-4 w-4" /></a>
      </div>
    );
  }

  return (
    <div className="flex min-w-44 items-center gap-2">
      {descriptor.kind === "image" ? <ImageIcon className="h-5 w-5" /> : descriptor.kind === "audio" ? <Play className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
      <span className="min-w-0 flex-1 truncate text-xs">{descriptor.name}</span>
          {url ? (
        <a href={url} download={descriptor.name} className="rounded-full p-1" aria-label="تنزيل المرفق"><Download className="h-4 w-4" /></a>
          ) : (
        <button type="button" onClick={() => void openAttachment()} disabled={loading} className="rounded-full p-1" aria-label={descriptor.kind === "audio" ? "تشغيل الرسالة الصوتية" : "فتح المرفق"}>
          {loading ? <span className="text-xs">…</span> : descriptor.kind === "audio" ? <Play className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [ttl, setTtl] = useState(0);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimer = useRef<number | null>(null);
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
      const { data: profile } = await supabase.from("profiles").select("id, username, display_name, identity_public_key").eq("id", peerId).maybeSingle();
      if (cancelled) return;
      setPeer(profile ?? null);
      if (profile?.identity_public_key) {
        try { setKey(await deriveConversationKey(vault.identityPrivateKey, profile.identity_public_key, id)); }
        catch { setKey(null); }
      }
    }
    void boot();
    return () => { cancelled = true; };
  }, [id, userId, vault, navigate]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    async function load() {
      const { data } = await supabase.from("messages").select("id, sender_id, encrypted_payload, iv, kind, created_at, expires_at").eq("conversation_id", id).order("created_at", { ascending: true });
      if (active) setRows((data as Row[] | null) ?? []);
    }
    void load();
    const channel = supabase.channel(`messages:${id}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
      () => void load(),
    ).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [id, userId]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const visible = useMemo(() => rows.filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > clock), [rows, clock]);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const row of visible) {
        try { next[row.id] = await decryptWithKey(key, { ciphertext: row.encrypted_payload, iv: row.iv }); }
        catch { next[row.id] = t("chat.decryptFailed"); }
      }
      if (!cancelled) setPlain(next);
    })();
    return () => { cancelled = true; };
  }, [key, visible, t]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [plain, visible.length]);

  async function insertEncrypted(plaintext: string, kind: string) {
    if (!key) throw new Error("KEY_UNAVAILABLE");
    const payload = await encryptWithKey(key, plaintext);
    const { data, error } = await supabase.from("messages").insert({
      conversation_id: id,
      sender_id: userId,
      encrypted_payload: payload.ciphertext,
      iv: payload.iv,
      kind,
      expires_at: ttl > 0 ? new Date(Date.now() + ttl * 1000).toISOString() : null,
    }).select("id").single();
    if (error) throw error;
    if (data?.id && session?.access_token) void notifyPeerOfNewMessage(session.access_token, data.id);
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if ((!draft.trim() && !pendingFile) || !key || sending) return;
    setSending(true);
    try {
      if (pendingFile) {
        const descriptor = await uploadEncryptedAttachment(id, pendingFile);
        await insertEncrypted(JSON.stringify(descriptor), descriptor.kind);
        setPendingFile(null);
      } else {
        await insertEncrypted(draft.trim(), "text");
        setDraft("");
      }
    } catch (error) {
      console.error(error);
      toast.error("تعذر إرسال المرفق أو الرسالة. تأكد من اتصالك ومن إعداد التخزين.");
    } finally { setSending(false); }
  }

  async function updateTtl(seconds: number) {
    setTtl(seconds);
    const { error } = await supabase.from("conversations").update({ disappearing_seconds: seconds }).eq("id", id);
    if (error) toast.error(t("common.error"));
  }

  async function removeMessage(messageId: string) {
    await supabase.from("messages").delete().eq("id", messageId);
    setRows((previous) => previous.filter((row) => row.id !== messageId));
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (recordingTimer.current) window.clearInterval(recordingTimer.current);
        recordingTimer.current = null;
        setRecording(false);
        setRecordingSeconds(0);
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size) setPendingFile(new File([blob], `رسالة-صوتية-${Date.now()}.webm`, { type: blob.type }));
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setRecordingSeconds(0);
      recordingTimer.current = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    } catch {
      toast.error("لم يُمنح إذن الميكروفون أو تعذر بدء التسجيل.");
    }
  }

  return (
    <div className="chat-shell mx-auto flex h-[100dvh] min-h-0 max-w-lg flex-col overflow-hidden">
      <header className="safe-top z-30 flex shrink-0 items-center gap-3 border-b border-border glass px-4 py-3">
        <Link to="/chats" className="rounded-full p-1.5 text-muted-foreground press"><ArrowRight className="h-5 w-5" /></Link>
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl brand-bg text-xs font-bold text-primary-foreground">{(peer?.display_name || peer?.username || "?").slice(0, 2).toUpperCase()}</span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{peer?.display_name || peer?.username || "—"}</p><p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" />{t("chat.encrypted")}</p></div>
        <Link to="/security/$id" params={{ id }} className="rounded-full p-1.5 text-primary press" aria-label={t("chat.security")}><ShieldCheck className="h-5 w-5" /></Link>
      </header>

      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground"><Timer className="h-3.5 w-3.5" /><span className="whitespace-nowrap">{t("chat.disappearing")}</span><Select value={String(ttl)} onValueChange={(value) => void updateTtl(Number(value))}><SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger><SelectContent>{TTL_OPTIONS.map((option) => <SelectItem key={option} value={String(option)}>{ttlLabel(option, t)}</SelectItem>)}</SelectContent></Select></div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-4">
        {!key && <p className="rounded-2xl border border-border bg-muted/40 p-3 text-center text-xs text-muted-foreground">{t("chat.decryptFailed")}</p>}
        {visible.map((row) => {
          const mine = row.sender_id === userId;
          let descriptor: AttachmentDescriptor | null = null;
          try {
            const parsed: unknown = JSON.parse(plain[row.id] ?? "");
            if (isAttachmentDescriptor(parsed)) descriptor = parsed;
          } catch { /* A text message is not JSON. */ }
          return <div key={row.id} className={cn("flex", mine ? "justify-end" : "justify-start")}><div className={cn("group max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm", mine ? "brand-bg text-primary-foreground" : "border border-border glass")}>
            {descriptor ? <AttachmentPreview descriptor={descriptor} /> : <p className="whitespace-pre-wrap break-words">{plain[row.id] ?? "…"}</p>}
            <div className="mt-1 flex items-center gap-2 text-[10px] opacity-70"><span>{new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{row.expires_at && <Timer className="h-3 w-3" />}{mine && <button type="button" onClick={() => void removeMessage(row.id)} aria-label={t("chat.delete")}><Trash2 className="h-3 w-3" /></button>}</div>
          </div></div>;
        })}
        {rows.length > visible.length && <p className="py-2 text-center text-xs text-muted-foreground">تم إخفاء الرسائل المنتهية.</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="shrink-0 border-t border-border glass px-4 py-3 safe-bottom">
        {pendingFile && <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs"><FileText className="h-4 w-4 text-primary" /><span className="min-w-0 flex-1 truncate">{pendingFile.name}</span><button type="button" onClick={() => setPendingFile(null)} aria-label="إزالة المرفق"><X className="h-4 w-4" /></button></div>}
        {recording && <div className="mb-2 flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"><span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />جارٍ تسجيل الصوت {recordingSeconds}s</div>}
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" className="hidden" accept="image/*,audio/*,.pdf,.txt,.doc,.docx,.zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) setPendingFile(file); event.currentTarget.value = ""; }} />
          <Button type="button" size="icon" variant="outline" className="press" disabled={!key || sending} onClick={() => fileInputRef.current?.click()} aria-label="إرفاق صورة أو ملف"><Paperclip className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant={recording ? "destructive" : "outline"} className="press" disabled={!key || sending} onClick={() => void toggleRecording()} aria-label={recording ? "إيقاف التسجيل" : "تسجيل صوتي"}>{recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</Button>
          <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={pendingFile ? "أضف تعليقًا لاحقًا" : t("chat.placeholder")} disabled={!key || sending || Boolean(pendingFile)} />
          <Button type="submit" size="icon" className="press" disabled={sending || (!draft.trim() && !pendingFile) || !key}><Send className="h-4 w-4" /></Button>
        </div>
      </form>
    </div>
  );
}

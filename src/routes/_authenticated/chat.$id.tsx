import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  Download,
  FileText,
  Image as ImageIcon,
  Mic,
  Paperclip,
  Pause,
  Play,
  Send,
  Forward,
  Pencil,
  ShieldCheck,
  Square,
  Timer,
  Trash2,
  Reply,
  Video,
  X,
  UserRound,
  Sparkles,
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
import { beginVoiceCapture, finishNativeVoiceCapture, startNativeVoiceCapture } from "@/lib/microphone";
import { useI18n } from "@/lib/i18n";
import { notifyPeerOfNewMessage } from "@/lib/push-notifications";
import { listConversations } from "@/lib/ab-api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { formatLastSeen, isOnline } from "@/lib/presence";
import { getPremiumSticker, PREMIUM_STICKERS } from "@/lib/premium-stickers";

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
  delivered_at: string | null;
  read_at: string | null;
  reply_to: string | null;
  edited: boolean;
  reactions: Record<string, string>;
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
  if (descriptor.kind === "video" && url) {
    return <video src={url} controls playsInline className="max-h-72 w-full rounded-xl bg-black" />;
  }

  return (
    <div className="flex min-w-44 items-center gap-2">
      {descriptor.kind === "image" ? <ImageIcon className="h-5 w-5" /> : descriptor.kind === "audio" ? <Play className="h-5 w-5" /> : descriptor.kind === "video" ? <Video className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
      <span className="min-w-0 flex-1 truncate text-xs">{descriptor.name}</span>
          {url ? (
        <a href={url} download={descriptor.name} className="rounded-full p-1" aria-label="تنزيل المرفق"><Download className="h-4 w-4" /></a>
          ) : (
        <button type="button" onClick={() => void openAttachment()} disabled={loading} className="rounded-full p-1" aria-label={descriptor.kind === "audio" ? "تشغيل الرسالة الصوتية" : "فتح المرفق"}>
          {loading ? <span className="text-xs">…</span> : descriptor.kind === "audio" || descriptor.kind === "video" ? <Play className="h-4 w-4" /> : <Download className="h-4 w-4" />}
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

  const [peer, setPeer] = useState<{ id: string; username: string; display_name: string; avatar_url: string | null; is_verified: boolean; last_seen: string | null; show_online: boolean; show_last_seen: boolean; identity_public_key: string | null } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
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
  const [replyTo, setReplyTo] = useState<Row | null>(null);
  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [forwardRow, setForwardRow] = useState<Row | null>(null);
  const [forwardTargets, setForwardTargets] = useState<Array<{ id: string; title: string; publicKey: string | null }>>([]);
  const [typingName, setTypingName] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const nativeRecordingRef = useRef(false);
  const recordingTimer = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingStopTimerRef = useRef<number | null>(null);
  const remoteTypingTimerRef = useRef<number | null>(null);
  const wasAtBottomRef = useRef(true);
  const lastVisibleCountRef = useRef(0);

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
      const profilesTable = (supabase as unknown as { from: (table: string) => any }).from("profiles");
      const { data: profileData } = await profilesTable.select("id, username, display_name, avatar_url, is_verified, last_seen, show_online, show_last_seen, identity_public_key").eq("id", peerId).maybeSingle();
      const { data: ownProfile } = await profilesTable.select("premium_until").eq("id", userId).maybeSingle();
      if (!cancelled) setIsPremium(Boolean(ownProfile?.premium_until && new Date(ownProfile.premium_until).getTime() > Date.now()));
      const profile = profileData as { id: string; username: string; display_name: string; avatar_url: string | null; is_verified: boolean; last_seen: string | null; show_online: boolean; show_last_seen: boolean; identity_public_key: string | null } | null;
      if (cancelled) return;
      setPeer(profile);
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
      const { data } = await supabase.from("messages").select("id, sender_id, encrypted_payload, iv, kind, created_at, expires_at, delivered_at, read_at, reply_to, edited, reactions").eq("conversation_id", id).order("created_at", { ascending: true });
      const nextRows = (data as Row[] | null) ?? [];
      if (active) setRows(nextRows);
      const unreadIds = nextRows.filter((message) => message.sender_id !== userId && !message.read_at).map((message) => message.id);
      if (unreadIds.length) {
        const now = new Date().toISOString();
        await supabase.from("messages").update({ delivered_at: now, read_at: now }).in("id", unreadIds);
      }
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
    if (!userId) return;
    const channel = supabase.channel(`typing:${id}`).on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload?.userId === userId) return;
      if (!payload?.active) {
        setTypingName(null);
        return;
      }
      setTypingName(peer?.display_name || peer?.username || "الطرف الآخر");
      if (remoteTypingTimerRef.current) window.clearTimeout(remoteTypingTimerRef.current);
      remoteTypingTimerRef.current = window.setTimeout(() => setTypingName(null), 2500);
    }).subscribe();
    typingChannelRef.current = channel;
    return () => {
      typingChannelRef.current = null;
      if (remoteTypingTimerRef.current) window.clearTimeout(remoteTypingTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [id, peer?.display_name, peer?.username, userId]);

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
      for (const row of rows) {
        try { next[row.id] = await decryptWithKey(key, { ciphertext: row.encrypted_payload, iv: row.iv }); }
        catch { next[row.id] = t("chat.decryptFailed"); }
      }
      if (!cancelled) setPlain(next);
    })();
    return () => { cancelled = true; };
  }, [key, rows, t]);

  useEffect(() => {
    const previousCount = lastVisibleCountRef.current;
    const hasNewMessage = visible.length > previousCount;
    if (visible.length && (previousCount === 0 || (hasNewMessage && wasAtBottomRef.current))) {
      bottomRef.current?.scrollIntoView({ behavior: previousCount === 0 ? "auto" : "smooth", block: "end" });
    }
    lastVisibleCountRef.current = visible.length;
  }, [visible.length]);

  function publishTyping(active: boolean) {
    if (!userId) return;
    void typingChannelRef.current?.send({ type: "broadcast", event: "typing", data: { userId, active } });
    if (!active) {
      if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
      return;
    }
    if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = window.setTimeout(() => publishTyping(false), 1800);
  }

  async function insertEncrypted(plaintext: string, kind: string) {
    if (!key) throw new Error("KEY_UNAVAILABLE");
    const payload = await encryptWithKey(key, plaintext);
    const { data, error } = await supabase.from("messages").insert({
      conversation_id: id,
      sender_id: userId,
      encrypted_payload: payload.ciphertext,
      iv: payload.iv,
      kind,
      reply_to: replyTo?.id ?? null,
      expires_at: ttl > 0 ? new Date(Date.now() + ttl * 1000).toISOString() : null,
    }).select("id").single();
    if (error) throw error;
    if (data?.id && session?.access_token) void notifyPeerOfNewMessage(session.access_token, data.id).catch(() => undefined);
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
      setReplyTo(null);
      publishTyping(false);
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

  async function setPremiumReaction(row: Row, stickerId: string) {
    if (!isPremium) {
      toast.error("تفاعلات الملصقات متاحة مع الاشتراك.");
      return;
    }
    const reactions = { ...(row.reactions ?? {}), [userId]: stickerId };
    const { error } = await supabase.from("messages").update({ reactions }).eq("id", row.id);
    if (error) {
      toast.error("تعذر حفظ التفاعل.");
      return;
    }
    setRows((previous) => previous.map((item) => item.id === row.id ? { ...item, reactions } : item));
    setReactionPickerFor(null);
  }

  function beginEdit(row: Row) {
    if (row.sender_id !== userId || row.kind !== "text") return;
    setEditingRow(row);
    setEditDraft(plain[row.id] ?? "");
    setReplyTo(null);
  }

  async function saveEdit() {
    if (!editingRow || !key || !editDraft.trim()) return;
    const payload = await encryptWithKey(key, editDraft.trim());
    const { error } = await supabase.from("messages").update({ encrypted_payload: payload.ciphertext, iv: payload.iv, edited: true }).eq("id", editingRow.id).eq("sender_id", userId);
    if (error) { toast.error("تعذر تعديل الرسالة."); return; }
    setPlain((previous) => ({ ...previous, [editingRow.id]: editDraft.trim() }));
    setEditingRow(null);
    setEditDraft("");
  }

  async function openForward(row: Row) {
    if (row.kind !== "text" || !plain[row.id]) { toast.error("تحويل المرفقات غير متاح حاليًا؛ اختر رسالة نصية."); return; }
    const conversations = (await listConversations(userId)) as Array<{ id: string; user_a: string; user_b: string }>;
    const peerIds = conversations.map((conversation) => (conversation.user_a === userId ? conversation.user_b : conversation.user_a));
    if (!peerIds.length) { toast.error("لا توجد محادثات أخرى للتحويل إليها."); return; }
    const profilesTable = (supabase as unknown as { from: (table: string) => any }).from("profiles");
    const { data } = await profilesTable.select("id, username, display_name, identity_public_key").in("id", peerIds);
    const profiles = (data ?? []) as Array<{ id: string; username: string; display_name: string; identity_public_key: string | null }>;
    const targets = conversations.filter((conversation) => conversation.id !== id).map((conversation) => { const peerId = conversation.user_a === userId ? conversation.user_b : conversation.user_a; const profile = profiles.find((item) => item.id === peerId); return { id: conversation.id, title: profile?.display_name || `@${profile?.username || "محادثة"}`, publicKey: profile?.identity_public_key ?? null }; }).filter((target) => Boolean(target.publicKey));
    setForwardTargets(targets);
    setForwardRow(row);
  }

  async function forwardTo(target: { id: string; title: string; publicKey: string | null }) {
    if (!forwardRow || !target.publicKey || !vault) return;
    const targetKey = await deriveConversationKey(vault.identityPrivateKey, target.publicKey, target.id);
    const payload = await encryptWithKey(targetKey, plain[forwardRow.id] ?? "");
    const { error } = await supabase.from("messages").insert({ conversation_id: target.id, sender_id: userId, encrypted_payload: payload.ciphertext, iv: payload.iv, kind: "text", reply_to: null, expires_at: null }).select("id").single();
    if (error) { toast.error("تعذر تحويل الرسالة."); return; }
    setForwardRow(null);
    toast.success(`تم تحويل الرسالة إلى ${target.title}`);
  }

  async function toggleRecording() {
    if (recording) {
      if (nativeRecordingRef.current) {
        try {
          const capturedFile = await finishNativeVoiceCapture();
          setPendingFile(capturedFile);
        } catch (error) {
          console.error(error);
          toast.error("لم يُلتقط صوت. تحقق من إذن الميكروفون ثم أعد المحاولة.");
        } finally {
          nativeRecordingRef.current = false;
          if (recordingTimer.current) window.clearInterval(recordingTimer.current);
          recordingTimer.current = null;
          setRecording(false);
          setRecordingSeconds(0);
        }
        return;
      }
      recorderRef.current?.stop();
      return;
    }
    try {
      const nativeCaptureStarted = await startNativeVoiceCapture();
      if (nativeCaptureStarted) {
        nativeRecordingRef.current = true;
        setRecording(true);
        setRecordingSeconds(0);
        recordingTimer.current = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
        return;
      }
      const stream = await beginVoiceCapture();
      const chunks: BlobPart[] = [];
      const preferredType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream);
      recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (recordingTimer.current) window.clearInterval(recordingTimer.current);
        recordingTimer.current = null;
        setRecording(false);
        toast.error("توقف التسجيل قبل اكتماله. أعد المحاولة بعد إغلاق أي تطبيق يستخدم الميكروفون.");
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (recordingTimer.current) window.clearInterval(recordingTimer.current);
        recordingTimer.current = null;
        setRecording(false);
        setRecordingSeconds(0);
        const mimeType = recorder.mimeType || preferredType || "audio/webm";
        const blob = new Blob(chunks, { type: mimeType });
        const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
        if (blob.size) setPendingFile(new File([blob], `رسالة-صوتية-${Date.now()}.${extension}`, { type: blob.type }));
        else toast.error("لم يُلتقط صوت. تحقق من إذن الميكروفون ثم أعد المحاولة.");
      };
      recorder.start(250);
      recorderRef.current = recorder;
      setRecording(true);
      setRecordingSeconds(0);
      recordingTimer.current = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    } catch (error) {
      console.error(error);
      const code = String((error as { name?: string; message?: string })?.name ?? (error as { message?: string })?.message ?? "");
      toast.error(code.includes("DENIED") || code.includes("NotAllowed") ? "اسمح بالميكروفون من إعدادات الهاتف ثم أعد المحاولة." : "تعذر بدء التسجيل. أغلق أي تطبيق يستخدم الميكروفون ثم أعد المحاولة.");
    }
  }

  return (
    <div className="chat-shell mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col overflow-hidden">
      <header className="safe-top z-30 flex shrink-0 items-center gap-3 border-b border-border glass px-4 py-3">
        <Link to="/chats" className="rounded-full p-1.5 text-muted-foreground press"><ArrowRight className="h-5 w-5" /></Link>
        <Link to="/profile/$id" params={{ id: peer?.id ?? "" }} className="flex min-w-0 flex-1 items-center gap-3 text-start press" aria-label="فتح ملف الشخص">
          {peer?.avatar_url ? <img src={peer.avatar_url} alt="" className="premium-avatar-frame h-9 w-9 rounded-2xl object-cover" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl brand-bg text-xs font-bold text-primary-foreground">{(peer?.display_name || peer?.username || "?").slice(0, 2).toUpperCase()}</span>}
          <span className="min-w-0"><span className="flex items-center gap-1.5"><span className="truncate text-sm font-semibold">{peer?.display_name || peer?.username || "—"}</span>{peer?.is_verified && <VerifiedBadge className="h-4 w-4 shrink-0" />}</span><span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground"><span className={peer && isOnline(peer) ? "h-1.5 w-1.5 rounded-full bg-emerald-500" : "h-1.5 w-1.5 rounded-full bg-muted-foreground/50"} />{peer ? formatLastSeen(peer) : "غير متصل"}</span></span>
        </Link>
        <Link to="/security/$id" params={{ id }} className="rounded-full p-1.5 text-primary press" aria-label={t("chat.security")}><ShieldCheck className="h-5 w-5" /></Link>
      </header>

      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground"><Timer className="h-3.5 w-3.5" /><span className="whitespace-nowrap">{t("chat.disappearing")}</span><Select value={String(ttl)} onValueChange={(value) => void updateTtl(Number(value))}><SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger><SelectContent>{TTL_OPTIONS.map((option) => <SelectItem key={option} value={String(option)}>{ttlLabel(option, t)}</SelectItem>)}</SelectContent></Select></div>

      <div onScroll={(event) => { const element = event.currentTarget; wasAtBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 72; }} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-4 premium-chat-surface">
        {!key && <p className="rounded-2xl border border-border bg-muted/40 p-3 text-center text-xs text-muted-foreground">{t("chat.decryptFailed")}</p>}
        {visible.map((row) => {
          const mine = row.sender_id === userId;
          let descriptor: AttachmentDescriptor | null = null;
          try {
            const parsed: unknown = JSON.parse(plain[row.id] ?? "");
            if (isAttachmentDescriptor(parsed)) descriptor = parsed;
          } catch { /* A text message is not JSON. */ }
          const repliedRow = row.reply_to ? rows.find((item) => item.id === row.reply_to) : null;
          return <div key={row.id} className={cn("flex", mine ? "justify-end" : "justify-start")}><div id={`message-${row.id}`} className={cn("group w-fit min-w-0 max-w-[82%] rounded-2xl px-3.5 py-2 text-sm shadow-sm", mine ? "brand-bg text-primary-foreground" : "border border-border glass")}>
            {repliedRow && <button type="button" onClick={() => document.getElementById(`message-${repliedRow.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} className="mb-2 block w-full border-s-2 border-current/60 ps-2 text-start text-[11px] opacity-75"><span className="block font-semibold">رد على رسالة</span><span className="block truncate">{plain[repliedRow.id] ?? "…"}</span></button>}
            {editingRow?.id === row.id ? <div className="flex gap-2"><Input value={editDraft} onChange={(event) => setEditDraft(event.target.value)} autoFocus className="min-w-0 text-sm" /><Button type="button" size="sm" onClick={() => void saveEdit()}>حفظ</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditingRow(null)}>إلغاء</Button></div> : descriptor ? <AttachmentPreview descriptor={descriptor} /> : <p className="whitespace-pre-wrap break-words">{plain[row.id] ?? "…"}</p>}
            <div className="mt-1 flex items-center gap-2 text-[10px] opacity-70"><span>{new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{row.edited && <span>معدّلة</span>}{row.expires_at && <Timer className="h-3 w-3" />}{mine && (row.read_at ? <CheckCheck className="h-3.5 w-3.5" aria-label="تمت القراءة" /> : row.delivered_at ? <CheckCheck className="h-3.5 w-3.5" aria-label="تم التسليم" /> : <Check className="h-3.5 w-3.5" aria-label="تم الإرسال" />)}<button type="button" onClick={() => setReplyTo(row)} aria-label="رد على الرسالة"><Reply className="h-3 w-3" /></button><button type="button" onClick={() => setReactionPickerFor(reactionPickerFor === row.id ? null : row.id)} aria-label="تفاعل بملصق مميز"><Sparkles className="h-3 w-3" /></button>{row.kind === "text" && <button type="button" onClick={() => void openForward(row)} aria-label="تحويل الرسالة"><Forward className="h-3 w-3" /></button>}{mine && row.kind === "text" && <button type="button" onClick={() => beginEdit(row)} aria-label="تعديل الرسالة"><Pencil className="h-3 w-3" /></button>}{mine && <button type="button" onClick={() => void removeMessage(row.id)} aria-label={t("chat.delete")}><Trash2 className="h-3 w-3" /></button>}</div>
            {Object.values(row.reactions ?? {}).length > 0 && <div className="mt-2 flex flex-wrap gap-1">{Array.from(new Set(Object.values(row.reactions ?? {}))).map((stickerId) => { const sticker = getPremiumSticker(stickerId); return sticker ? <img key={sticker.id} src={sticker.src} alt={sticker.label} className="premium-sticker-motion h-7 w-7 rounded-lg bg-background/80 p-0.5 shadow-sm" /> : null; })}</div>}
            {reactionPickerFor === row.id && <div className="mt-2 flex gap-1 rounded-xl border border-current/15 bg-background/90 p-1.5 text-foreground shadow-lg">{PREMIUM_STICKERS.map((sticker) => <button key={sticker.id} type="button" onClick={() => void setPremiumReaction(row, sticker.id)} className="rounded-lg p-1 press" aria-label={sticker.label}><img src={sticker.src} alt="" className="premium-sticker-motion h-7 w-7" /></button>)}</div>}
          </div></div>;
        })}
        {typingName && <p className="px-1 text-xs text-muted-foreground"><span className="me-1 inline-flex gap-0.5 align-middle"><i className="h-1 w-1 animate-bounce rounded-full bg-primary [animation-delay:-.2s]" /><i className="h-1 w-1 animate-bounce rounded-full bg-primary [animation-delay:-.1s]" /><i className="h-1 w-1 animate-bounce rounded-full bg-primary" /></span>{typingName} يكتب</p>}
        {rows.length > visible.length && <p className="py-2 text-center text-xs text-muted-foreground">تم إخفاء الرسائل المنتهية.</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="chat-composer z-20 mt-auto shrink-0 border-t border-border bg-background/95 px-4 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        {replyTo && <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs"><Reply className="h-4 w-4 text-primary" /><span className="min-w-0 flex-1 truncate">{plain[replyTo.id] ?? "رد على رسالة"}</span><button type="button" onClick={() => setReplyTo(null)} aria-label="إلغاء الرد"><X className="h-4 w-4" /></button></div>}
        {pendingFile && <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs"><FileText className="h-4 w-4 text-primary" /><span className="min-w-0 flex-1 truncate">{pendingFile.name}</span><button type="button" onClick={() => setPendingFile(null)} aria-label="إزالة المرفق"><X className="h-4 w-4" /></button></div>}
        {recording && <div className="mb-2 flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"><span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />جارٍ تسجيل الصوت {recordingSeconds}s</div>}
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx,.zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) setPendingFile(file); event.currentTarget.value = ""; }} />
          <Button type="button" size="icon" variant="outline" className="press" disabled={!key || sending} onClick={() => fileInputRef.current?.click()} aria-label="إرفاق صورة أو ملف"><Paperclip className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant={recording ? "destructive" : "outline"} className="press" disabled={!key || sending} onClick={() => void toggleRecording()} aria-label={recording ? "إيقاف التسجيل" : "تسجيل صوتي"}>{recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</Button>
          <Input value={draft} onChange={(event) => { setDraft(event.target.value); publishTyping(Boolean(event.target.value.trim())); }} placeholder={pendingFile ? "أضف تعليقًا لاحقًا" : t("chat.placeholder")} disabled={!key || sending || Boolean(pendingFile)} />
          <Button type="submit" size="icon" className="press" disabled={sending || (!draft.trim() && !pendingFile) || !key}><Send className="h-4 w-4" /></Button>
        </div>
      </form>

      {forwardRow && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="تحويل الرسالة" onClick={() => setForwardRow(null)}><div className="w-full max-w-sm rounded-3xl border border-border bg-background p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><h2 className="font-bold">تحويل الرسالة إلى</h2><button type="button" onClick={() => setForwardRow(null)} aria-label="إغلاق"><X className="h-5 w-5" /></button></div>{forwardTargets.length ? <div className="space-y-2">{forwardTargets.map((target) => <button type="button" key={target.id} onClick={() => void forwardTo(target)} className="flex w-full items-center gap-3 rounded-2xl border border-border px-3 py-3 text-start press"><Forward className="h-4 w-4 text-primary" /><span className="truncate">{target.title}</span></button>)}</div> : <p className="text-sm text-muted-foreground">لا توجد محادثات أخرى مفاتيحها متاحة.</p>}</div></div>}

      {profileOpen && peer && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="ملف الشخص" onClick={() => setProfileOpen(false)}>
        <div className="w-full max-w-sm rounded-3xl border border-border bg-background p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-start justify-between"><button type="button" onClick={() => setProfileOpen(false)} className="rounded-full p-2 text-muted-foreground press" aria-label="إغلاق"><X className="h-5 w-5" /></button><UserRound className="h-5 w-5 text-muted-foreground" /></div>
          <div className="mt-2 flex flex-col items-center text-center">{peer.avatar_url ? <img src={peer.avatar_url} alt="" className="h-24 w-24 rounded-3xl object-cover" /> : <span className="flex h-24 w-24 items-center justify-center rounded-3xl brand-bg text-2xl font-bold text-primary-foreground">{(peer.display_name || peer.username || "?").slice(0, 2).toUpperCase()}</span>}<div className="mt-3 flex items-center gap-2"><h2 className="text-lg font-bold">{peer.display_name || peer.username}</h2>{peer.is_verified && <VerifiedBadge className="h-5 w-5" />}</div><p className="mt-1 text-sm text-muted-foreground">@{peer.username}</p><p className="mt-1 text-xs text-muted-foreground">{formatLastSeen(peer)}</p></div>
          <div className="mt-5 rounded-2xl bg-muted/50 p-3 text-center text-xs text-muted-foreground">يمكنك فتح ملف الشخص من رأس المحادثة في أي وقت.</div>
        </div>
      </div>}
    </div>
  );
}

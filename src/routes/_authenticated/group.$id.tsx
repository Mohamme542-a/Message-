import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Camera, Crown, ImageOff, Link as LinkIcon, LogOut, RefreshCw, Send, Settings2, Trash2, Users } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { decryptWithKey, encryptWithKey } from "@/lib/crypto";
import { openGroupKeyForMember, sealGroupKeyForMember } from "@/lib/group-crypto";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { uploadGroupAvatar } from "@/lib/group-media";

export const Route = createFileRoute("/_authenticated/group/$id")({
  ssr: false,
  component: GroupPage,
});

interface GroupMeta {
  id: string;
  title: string;
  description: string;
  kind: "group" | "channel";
  avatar_url: string | null;
  invite_slug: string;
  owner_id: string;
  slow_mode_seconds: number;
  members_can_invite: boolean;
}

interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  encrypted_payload: string;
  iv: string;
  kind: string;
  reply_to: string | null;
  created_at: string;
}

interface Member {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  role: "owner" | "admin" | "member";
}

function GroupPage() {
  const { id } = Route.useParams();
  const { session, vault } = useSession();
  const userId = session?.user.id ?? "";
  const queryClient = useQueryClient();
  const db = supabase as unknown as { from: (table: string) => any };
  const communityClient = supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }> };
  const [groupKey, setGroupKey] = useState<CryptoKey | null>(null);
  const [rows, setRows] = useState<GroupMessage[]>([]);
  const [plain, setPlain] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [memberUsername, setMemberUsername] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [slowMode, setSlowMode] = useState(0);
  const [membersCanInvite, setMembersCanInvite] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const groupQuery = useQuery({
    queryKey: ["group", id],
    queryFn: async () => {
      const { data, error } = await db.from("groups").select("id, title, description, kind, avatar_url, invite_slug, owner_id, slow_mode_seconds, members_can_invite").eq("id", id).maybeSingle();
      if (error || !data) throw error ?? new Error("GROUP_NOT_FOUND");
      return data as GroupMeta;
    },
  });
  const group = groupQuery.data;

  const membersQuery = useQuery({
    queryKey: ["group-members", id],
    enabled: Boolean(group),
    queryFn: async () => {
      const { data: memberships, error } = await db.from("group_members").select("member_id, role").eq("group_id", id).order("joined_at");
      if (error) throw error;
      const rows = (memberships ?? []) as Array<{ member_id: string; role: Member["role"] }>;
      if (!rows.length) return [] as Member[];
      const { data: profiles } = await db.from("profiles").select("id, username, display_name, avatar_url, is_verified").in("id", rows.map((row) => row.member_id));
      const lookup = new Map(((profiles ?? []) as Omit<Member, "role">[]).map((profile) => [profile.id, profile]));
      return rows.flatMap((row) => {
        const profile = lookup.get(row.member_id);
        return profile ? [{ ...profile, role: row.role }] : [];
      });
    },
  });
  const members = membersQuery.data ?? [];
  const myRole = members.find((member) => member.id === userId)?.role;
  const canManage = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";
  const canPublish = group?.kind === "group" || canManage;

  useEffect(() => {
    if (!group) return;
    setGroupTitle(group.title);
    setGroupDescription(group.description);
    setSlowMode(group.slow_mode_seconds ?? 0);
    setMembersCanInvite(Boolean(group.members_can_invite));
  }, [group]);

  useEffect(() => {
    if (!vault || !group) return;
    let cancelled = false;
    void (async () => {
      const { data: envelope } = await db.from("group_key_envelopes")
        .select("encrypted_key, iv, sender_id, key_version")
        .eq("group_id", group.id)
        .eq("member_id", userId)
        .order("key_version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!envelope) return;
      const { data: sender } = await db.from("profiles").select("identity_public_key").eq("id", envelope.sender_id).maybeSingle();
      if (!sender?.identity_public_key) return;
      const nextKey = await openGroupKeyForMember(vault.identityPrivateKey, sender.identity_public_key, group.id, envelope.encrypted_key, envelope.iv);
      if (!cancelled) setGroupKey(nextKey);
    })().catch(() => !cancelled && setGroupKey(null));
    return () => { cancelled = true; };
  }, [db, group, userId, vault]);

  useEffect(() => {
    let active = true;
    async function loadMessages() {
      const { data } = await db.from("group_messages").select("id, group_id, sender_id, encrypted_payload, iv, kind, reply_to, created_at").eq("group_id", id).order("created_at", { ascending: true });
      if (active) setRows((data ?? []) as GroupMessage[]);
    }
    void loadMessages();
    const channel = supabase.channel(`group-messages:${id}`).on("postgres_changes", { event: "*", schema: "public", table: "group_messages", filter: `group_id=eq.${id}` }, () => void loadMessages()).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [db, id]);

  useEffect(() => {
    if (!groupKey) return;
    let cancelled = false;
    void (async () => {
      const messages: Record<string, string> = {};
      for (const row of rows) {
        try { messages[row.id] = await decryptWithKey(groupKey, { ciphertext: row.encrypted_payload, iv: row.iv }); }
        catch { messages[row.id] = "تعذر فتح الرسالة"; }
      }
      if (!cancelled) setPlain(messages);
    })();
    return () => { cancelled = true; };
  }, [groupKey, rows]);

  const memberLookup = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  async function send() {
    if (!draft.trim() || !groupKey || !canPublish || sending) return;
    setSending(true);
    try {
      const payload = await encryptWithKey(groupKey, draft.trim());
      const { error } = await db.from("group_messages").insert({ group_id: id, sender_id: userId, encrypted_payload: payload.ciphertext, iv: payload.iv, kind: "text" });
      if (error) throw error;
      setDraft("");
    } catch {
      toast.error("تعذر إرسال الرسالة.");
    } finally {
      setSending(false);
    }
  }

  async function removeMessage(messageId: string) {
    const { error } = await db.from("group_messages").delete().eq("id", messageId);
    if (error) toast.error("تعذر حذف الرسالة.");
  }

  async function updateMember(member: Member, nextRole: Member["role"] | "remove") {
    if (!canManage || member.id === userId) return;
    const { error } = nextRole === "remove"
      ? await communityClient.rpc("remove_group_member", { _group_id: id, _member_id: member.id })
      : await communityClient.rpc("set_group_member_role", { _group_id: id, _member_id: member.id, _role: nextRole });
    if (error) toast.error("تعذر تعديل العضو.");
    else await queryClient.invalidateQueries({ queryKey: ["group-members", id] });
  }

  async function addMember() {
    if (!groupKey || !vault || !memberUsername.trim() || !canManage || addingMember) return;
    setAddingMember(true);
    try {
      const { data: profile } = await db.from("profiles").select("id, identity_public_key").eq("username", memberUsername.trim().toLowerCase()).maybeSingle();
      if (!profile?.id || !profile.identity_public_key) throw new Error("PROFILE_NOT_FOUND");
      const { error: memberError } = await db.from("group_members").insert({ group_id: id, member_id: profile.id, role: "member" });
      if (memberError && !String(memberError.message ?? "").includes("duplicate")) throw memberError;
      const envelope = await sealGroupKeyForMember(vault.identityPrivateKey, profile.identity_public_key, id, groupKey);
      const { error: keyError } = await db.from("group_key_envelopes").upsert({ group_id: id, member_id: profile.id, sender_id: userId, encrypted_key: envelope.ciphertext, iv: envelope.iv, key_version: 1 });
      if (keyError) throw keyError;
      setMemberUsername("");
      await queryClient.invalidateQueries({ queryKey: ["group-members", id] });
      toast.success("تمت إضافة العضو.");
    } catch {
      toast.error("تعذر إضافة العضو. تحقق من اسم المستخدم.");
    } finally {
      setAddingMember(false);
    }
  }

  async function copyInvite() {
    if (!group) return;
    await navigator.clipboard.writeText(`alphabyte://join/${group.invite_slug}`);
    toast.success("تم نسخ رابط الانضمام.");
  }

  async function saveGroupSettings() {
    if (!group || !isOwner || !groupTitle.trim() || savingGroup) return;
    setSavingGroup(true);
    try {
      const { error } = await db.from("groups").update({
        title: groupTitle.trim(),
        description: groupDescription.trim(),
        slow_mode_seconds: slowMode,
        members_can_invite: membersCanInvite,
      }).eq("id", id).eq("owner_id", userId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["group", id] });
      toast.success("تم حفظ إعدادات المساحة.");
    } catch {
      toast.error("تعذر حفظ الإعدادات. هذه العملية متاحة لمالك المساحة فقط.");
    } finally {
      setSavingGroup(false);
    }
  }

  async function chooseGroupAvatar(file: File | undefined) {
    if (!group || !file || !isOwner || avatarBusy) return;
    setAvatarBusy(true);
    try {
      const avatarUrl = await uploadGroupAvatar(userId, id, file);
      const { error } = await db.from("groups").update({ avatar_url: avatarUrl }).eq("id", id).eq("owner_id", userId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["group", id] });
      toast.success("تم تحديث صورة المساحة.");
    } catch {
      toast.error("تعذر رفع الصورة. اختر صورة أصغر من 3 ميغابايت.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeGroupAvatar() {
    if (!group || !isOwner || avatarBusy) return;
    setAvatarBusy(true);
    try {
      const { error } = await db.from("groups").update({ avatar_url: null }).eq("id", id).eq("owner_id", userId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["group", id] });
      toast.success("تم حذف صورة المساحة.");
    } catch {
      toast.error("تعذر حذف الصورة.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function rotateInvite() {
    if (!group || !isOwner) return;
    const value = Array.from(crypto.getRandomValues(new Uint8Array(9))).map((part) => part.toString(16).padStart(2, "0")).join("");
    const { error } = await db.from("groups").update({ invite_slug: value }).eq("id", id).eq("owner_id", userId);
    if (error) toast.error("تعذر تجديد الرابط.");
    else {
      await queryClient.invalidateQueries({ queryKey: ["group", id] });
      toast.success("تم إبطال الرابط السابق وإنشاء رابط جديد.");
    }
  }

  async function leaveGroup() {
    if (!group || isOwner) {
      toast.error("انقل الملكية أو أزل المساحة من إدارة المالك أولًا.");
      return;
    }
    const { error } = await db.from("group_members").delete().eq("group_id", id).eq("member_id", userId);
    if (error) toast.error("تعذر مغادرة المساحة.");
    else window.location.assign("/chats");
  }

  return (
    <div className="chat-shell mx-auto flex h-full min-h-0 w-full max-w-lg flex-col overflow-hidden">
      <header className="safe-top flex shrink-0 items-center gap-3 border-b border-border glass px-4 py-3">
        <Link to="/chats" className="rounded-full p-1.5 text-muted-foreground press"><ArrowRight className="h-5 w-5" /></Link>
        {group?.avatar_url ? <img src={group.avatar_url} alt="" className="h-10 w-10 rounded-2xl object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-2xl brand-bg text-primary-foreground"><Users className="h-5 w-5" /></span>}
        <div className="min-w-0 flex-1"><h1 className="truncate text-base font-semibold">{group?.title ?? "…"}</h1><p className="truncate text-xs text-muted-foreground">{group?.kind === "channel" ? "قناة" : "مجموعة"} · {members.length} عضو</p></div>
        <Button type="button" size="icon" variant="outline" className="rounded-full" onClick={() => void copyInvite()} aria-label="نسخ رابط الانضمام"><LinkIcon className="h-4 w-4" /></Button>
        {canManage ? <Button type="button" size="icon" variant={manageOpen ? "default" : "outline"} className="rounded-full" onClick={() => setManageOpen((value) => !value)} aria-label="إدارة المساحة"><Settings2 className="h-4 w-4" /></Button> : null}
      </header>

      <div className="shrink-0 border-b border-border px-4 py-2"><p className="text-xs text-muted-foreground">{group?.description || "مساحة خاصة للأعضاء."}</p></div>
      {manageOpen && group ? <section className="max-h-[48%] shrink-0 overflow-y-auto border-b border-border bg-background px-4 py-4" dir="rtl">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">إدارة {group.kind === "channel" ? "القناة" : "المجموعة"}</h2><p className="text-[11px] text-muted-foreground">تظهر أدواتك وفق دورك داخل المساحة.</p></div><Crown className="h-5 w-5 text-primary" /></div>
        {isOwner ? <div className="space-y-3 rounded-2xl border border-border p-3">
          <div className="flex items-center gap-3"><button type="button" className="relative shrink-0" onClick={() => avatarInputRef.current?.click()} aria-label="تغيير صورة المساحة">{group.avatar_url ? <img src={group.avatar_url} alt="" className="h-14 w-14 rounded-2xl object-cover" /> : <span className="flex h-14 w-14 items-center justify-center rounded-2xl brand-bg text-primary-foreground"><Users className="h-5 w-5" /></span>}<span className="absolute -bottom-1 -end-1 rounded-full bg-background p-1 shadow"><Camera className="h-3.5 w-3.5 text-primary" /></span></button><div className="min-w-0 flex-1"><p className="text-xs font-medium">صورة المساحة</p><p className="text-[11px] text-muted-foreground">صورة عامة حتى يميزها الأعضاء.</p><div className="mt-2 flex gap-2"><Button size="sm" variant="outline" disabled={avatarBusy} onClick={() => avatarInputRef.current?.click()}>{avatarBusy ? "…" : "تغيير"}</Button>{group.avatar_url ? <Button size="sm" variant="outline" disabled={avatarBusy} onClick={() => void removeGroupAvatar()}><ImageOff className="me-1 h-3.5 w-3.5" />حذف</Button> : null}</div></div><input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { void chooseGroupAvatar(event.target.files?.[0]); event.currentTarget.value = ""; }} /></div>
          <Input value={groupTitle} maxLength={70} onChange={(event) => setGroupTitle(event.target.value)} placeholder="اسم المساحة" />
          <textarea value={groupDescription} maxLength={512} rows={2} onChange={(event) => setGroupDescription(event.target.value)} placeholder="الوصف" className="flex w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <div className="grid grid-cols-2 gap-2"><label className="rounded-xl border border-border p-2 text-[11px]"><span className="mb-1 block text-muted-foreground">وضع الإبطاء</span><select value={slowMode} onChange={(event) => setSlowMode(Number(event.target.value))} className="w-full bg-transparent text-sm outline-none"><option value={0}>بدون</option><option value={10}>10 ثوانٍ</option><option value={30}>30 ثانية</option><option value={60}>دقيقة</option><option value={300}>5 دقائق</option></select></label><label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-2 text-[11px]"><input type="checkbox" checked={membersCanInvite} onChange={(event) => setMembersCanInvite(event.target.checked)} />السماح للأعضاء بدعوة أشخاص</label></div>
          <Button className="w-full" disabled={!groupTitle.trim() || savingGroup} onClick={() => void saveGroupSettings()}>{savingGroup ? "جارٍ الحفظ" : "حفظ إعدادات المساحة"}</Button>
        </div> : null}
        <div className="mt-3 rounded-2xl border border-border p-3"><p className="mb-2 text-xs font-semibold">رابط الانضمام</p><div className="flex gap-2"><Button size="sm" variant="outline" className="flex-1" onClick={() => void copyInvite()}><LinkIcon className="me-1 h-3.5 w-3.5" />نسخ الرابط</Button>{isOwner ? <Button size="sm" variant="outline" onClick={() => void rotateInvite()}><RefreshCw className="me-1 h-3.5 w-3.5" />تجديد</Button> : null}</div></div>
        {canManage ? <div className="mt-3 rounded-2xl border border-border p-3"><p className="mb-2 text-xs font-semibold">الأعضاء والصلاحيات</p><div className="flex gap-2"><Input value={memberUsername} onChange={(event) => setMemberUsername(event.target.value)} placeholder="اسم المستخدم" /><Button size="sm" disabled={!memberUsername.trim() || addingMember || !groupKey} onClick={() => void addMember()}>{addingMember ? "…" : "إضافة"}</Button></div><div className="mt-3 space-y-2">{members.map((member) => <div key={member.id} className="flex items-center gap-2 rounded-xl bg-muted/40 px-2 py-2 text-xs"><span className="min-w-0 flex-1 truncate">{member.display_name || member.username}<span className="ms-1 text-muted-foreground">· {member.role === "owner" ? "المالك" : member.role === "admin" ? "مشرف" : "عضو"}</span></span>{member.id !== userId && <>{isOwner ? <Button size="sm" variant="outline" onClick={() => void updateMember(member, member.role === "admin" ? "member" : "admin")}>{member.role === "admin" ? "خفض" : "مشرف"}</Button> : null}{member.role !== "owner" ? <Button size="sm" variant="outline" onClick={() => void updateMember(member, "remove")}>إزالة</Button> : null}</>}</div>)}</div></div> : null}
        {!isOwner ? <Button variant="outline" className="mt-3 w-full text-destructive" onClick={() => void leaveGroup()}><LogOut className="me-1 h-4 w-4" />مغادرة {group.kind === "channel" ? "القناة" : "المجموعة"}</Button> : null}
      </section> : null}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {rows.map((row) => {
          const mine = row.sender_id === userId;
          const sender = memberLookup.get(row.sender_id);
          return <div key={row.id} className={cn("flex", mine ? "justify-end" : "justify-start")}><div className={cn("max-w-[82%] rounded-2xl px-3.5 py-2 text-sm shadow-sm", mine ? "brand-bg text-primary-foreground" : "border border-border glass")}><p className="mb-1 flex items-center gap-1 text-[11px] font-semibold opacity-75">{sender?.display_name || sender?.username || "عضو"}{sender?.is_verified ? <VerifiedBadge className="text-xs" /> : null}{sender?.role === "owner" ? <Crown className="h-3 w-3" /> : null}</p><p className="whitespace-pre-wrap break-words">{plain[row.id] ?? "…"}</p><div className="mt-1 flex items-center gap-2 text-[10px] opacity-70"><span>{new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{mine ? <button type="button" onClick={() => void removeMessage(row.id)} aria-label="حذف الرسالة"><Trash2 className="h-3 w-3" /></button> : null}</div></div></div>;
        })}
      </div>

      <section className="shrink-0 border-t border-border glass px-4 py-3 safe-bottom">
        {canPublish ? <div className="flex gap-2"><Input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="اكتب رسالة" disabled={!groupKey || sending} /><Button type="button" size="icon" disabled={!draft.trim() || !groupKey || sending} onClick={() => void send()}><Send className="h-4 w-4" /></Button></div> : <p className="rounded-xl bg-muted px-3 py-2 text-center text-xs text-muted-foreground">النشر في هذه القناة متاح للإدارة فقط.</p>}
      </section>
    </div>
  );
}

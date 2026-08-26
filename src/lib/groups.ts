import { supabase } from "@/integrations/supabase/client";
import { generateGroupMessageKey, sealGroupKeyForMember } from "@/lib/group-crypto";

export type GroupKind = "group" | "channel";

export interface GroupRow {
  id: string;
  owner_id: string;
  kind: GroupKind;
  title: string;
  description: string;
  avatar_url: string | null;
  invite_slug: string;
  slow_mode_seconds: number;
  members_can_invite: boolean;
  created_at: string;
}

function nextGroupId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export async function createGroup(
  creatorPrivateKey: string,
  creatorPublicKey: string,
  options: { title: string; description: string; kind: GroupKind; avatarUrl?: string | null },
) {
  const { data: authData } = await supabase.auth.getUser();
  const creatorId = authData.user?.id;
  if (!creatorId) throw new Error("GROUP_AUTH_REQUIRED");
  const rpc = (supabase as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  }).rpc;
  const { data, error } = await rpc("create_group", {
    _title: options.title.trim(),
    _kind: options.kind,
    _description: options.description.trim(),
    _avatar_url: options.avatarUrl ?? null,
  });
  let rawGroup = Array.isArray(data) ? data[0] : data;
  if (error || !rawGroup || typeof rawGroup !== "object" || !("id" in rawGroup)) {
    // Fallback keeps the client usable on projects where a previously deployed RPC grant is missing.
    const groups = (supabase as unknown as { from: (table: string) => any }).from("groups");
    const groupId = nextGroupId();
    const { error: insertError } = await groups.insert({ id: groupId, owner_id: creatorId, kind: options.kind, title: options.title.trim(), description: options.description.trim(), avatar_url: options.avatarUrl ?? null });
    if (insertError) throw new Error(`GROUP_CREATION_FAILED:${String((error as { message?: string })?.message ?? (insertError as { message?: string })?.message ?? error ?? insertError)}`);
    const members = (supabase as unknown as { from: (table: string) => any }).from("group_members");
    const { error: ownerError } = await members.insert({ group_id: groupId, member_id: creatorId, role: "owner" });
    if (ownerError) throw new Error(`GROUP_OWNER_SETUP_FAILED:${String((ownerError as { message?: string }).message ?? ownerError)}`);
    const { data: inserted, error: selectError } = await groups
      .select("id, owner_id, kind, title, description, avatar_url, invite_slug, slow_mode_seconds, members_can_invite, created_at")
      .eq("id", groupId)
      .single();
    if (selectError || !inserted) throw new Error(`GROUP_READBACK_FAILED:${String((selectError as { message?: string })?.message ?? selectError)}`);
    rawGroup = inserted;
  }
  const group = rawGroup as GroupRow;
  const ownerId = group.owner_id || creatorId;
  const key = await generateGroupMessageKey();
  const envelope = await sealGroupKeyForMember(creatorPrivateKey, creatorPublicKey, group.id, key);
  const groupKeyEnvelopes = (supabase as unknown as { from: (table: string) => any }).from("group_key_envelopes");
  const { error: envelopeError } = await groupKeyEnvelopes.insert({
    group_id: group.id,
    member_id: ownerId,
    sender_id: ownerId,
    encrypted_key: envelope.ciphertext,
    iv: envelope.iv,
    key_version: 1,
  });
  if (envelopeError) throw new Error(`GROUP_KEY_ENVELOPE_FAILED:${String((envelopeError as { message?: string }).message ?? envelopeError)}`);
  return group;
}

export async function listMyGroups(userId: string) {
  const groupMembers = (supabase as unknown as { from: (table: string) => any }).from("group_members");
  const { data, error } = await groupMembers
    .select("role, groups(id, owner_id, kind, title, description, avatar_url, invite_slug, slow_mode_seconds, members_can_invite, created_at)")
    .eq("member_id", userId);
  if (error) throw error;
  return ((data ?? []) as Array<{ role: "owner" | "admin" | "member"; groups: GroupRow | null }>).flatMap((row) => {
    const group = row.groups;
    return group ? [{ group, role: row.role as "owner" | "admin" | "member" }] : [];
  });
}

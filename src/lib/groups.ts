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

export async function createGroup(
  creatorPrivateKey: string,
  creatorPublicKey: string,
  options: { title: string; description: string; kind: GroupKind; avatarUrl?: string | null },
) {
  const rpc = (supabase as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  }).rpc;
  const { data, error } = await rpc("create_group", {
    _title: options.title.trim(),
    _kind: options.kind,
    _description: options.description.trim(),
    _avatar_url: options.avatarUrl ?? null,
  });
  const rawGroup = Array.isArray(data) ? data[0] : data;
  if (error || !rawGroup) throw new Error(`GROUP_RPC_FAILED:${String((error as { message?: string })?.message ?? error ?? "empty response")}`);
  const group = rawGroup as GroupRow;
  const key = await generateGroupMessageKey();
  const envelope = await sealGroupKeyForMember(creatorPrivateKey, creatorPublicKey, group.id, key);
  const groupKeyEnvelopes = (supabase as unknown as { from: (table: string) => any }).from("group_key_envelopes");
  const { error: envelopeError } = await groupKeyEnvelopes.insert({
    group_id: group.id,
    member_id: group.owner_id,
    sender_id: group.owner_id,
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

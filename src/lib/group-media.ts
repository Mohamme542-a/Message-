import { supabase } from "@/integrations/supabase/client";

const avatarBucket = "profile-avatars";
const maxAvatarBytes = 3 * 1024 * 1024;

function extension(file: File) {
  const value = file.name.split(".").pop()?.toLowerCase();
  return value && /^[a-z0-9]{1,8}$/.test(value) ? value : "jpg";
}

export async function uploadGroupAvatar(ownerId: string, groupId: string, file: File) {
  if (!file.type.startsWith("image/") || file.size === 0 || file.size > maxAvatarBytes) {
    throw new Error("GROUP_AVATAR_INVALID");
  }
  const path = `${ownerId}/groups/${groupId}/cover-${crypto.randomUUID()}.${extension(file)}`;
  const { error } = await supabase.storage.from(avatarBucket).upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(avatarBucket).getPublicUrl(path).data.publicUrl;
}

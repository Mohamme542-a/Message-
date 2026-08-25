import { supabase } from "@/integrations/supabase/client";

const avatarBucket = "profile-avatars";
const maxAvatarBytes = 3 * 1024 * 1024;

function fileExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension && /^[a-z0-9]{1,8}$/.test(extension) ? extension : "jpg";
}

export async function uploadProfileAvatar(userId: string, file: File) {
  if (!file.type.startsWith("image/") || file.size === 0 || file.size > maxAvatarBytes) {
    throw new Error("AVATAR_INVALID");
  }
  const path = `${userId}/avatar-${crypto.randomUUID()}.${fileExtension(file)}`;
  const { error } = await supabase.storage.from(avatarBucket).upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(avatarBucket).getPublicUrl(path).data.publicUrl;
}

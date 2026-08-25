import { decryptFile, encryptFile } from "@/lib/crypto";
import { supabase } from "@/integrations/supabase/client";

const bucket = "encrypted-attachments";
const maxAttachmentBytes = 80 * 1024 * 1024;

export type AttachmentKind = "image" | "audio" | "video" | "file";

export interface AttachmentDescriptor {
  v: 1;
  type: "attachment";
  kind: AttachmentKind;
  name: string;
  mimeType: string;
  size: number;
  path: string;
  fileKey: string;
  fileIv: string;
}

function kindFor(file: File): AttachmentKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

export async function uploadEncryptedAttachment(conversationId: string, file: File): Promise<AttachmentDescriptor> {
  if (file.size === 0 || file.size > maxAttachmentBytes) {
    throw new Error("ATTACHMENT_SIZE_INVALID");
  }
  const { encrypted, keyB64, ivB64 } = await encryptFile(await file.arrayBuffer());
  const path = `${conversationId}/${crypto.randomUUID()}.bin`;
  const { error } = await supabase.storage.from(bucket).upload(path, encrypted, {
    contentType: "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;

  return {
    v: 1,
    type: "attachment",
    kind: kindFor(file),
    name: file.name || "attachment",
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    path,
    fileKey: keyB64,
    fileIv: ivB64,
  };
}

export async function downloadDecryptedAttachment(descriptor: AttachmentDescriptor) {
  const { data, error } = await supabase.storage.from(bucket).download(descriptor.path);
  if (error || !data) throw error ?? new Error("ATTACHMENT_NOT_FOUND");
  const plaintext = await decryptFile(await data.arrayBuffer(), descriptor.fileKey, descriptor.fileIv);
  return new Blob([plaintext], { type: descriptor.mimeType });
}

export function isAttachmentDescriptor(value: unknown): value is AttachmentDescriptor {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AttachmentDescriptor>;
  return candidate.v === 1 && candidate.type === "attachment" && typeof candidate.path === "string" &&
    typeof candidate.fileKey === "string" && typeof candidate.fileIv === "string";
}

import { decryptWithKey, deriveConversationKey, encryptWithKey, fromB64, toB64 } from "@/lib/crypto";

function source(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

export async function generateGroupMessageKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function serializeGroupMessageKey(key: CryptoKey) {
  return toB64(await crypto.subtle.exportKey("raw", key));
}

export async function importGroupMessageKey(rawKey: string) {
  return crypto.subtle.importKey("raw", source(fromB64(rawKey)), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function sealGroupKeyForMember(
  senderPrivateKey: string,
  memberPublicKey: string,
  groupId: string,
  groupKey: CryptoKey,
) {
  const wrappingKey = await deriveConversationKey(senderPrivateKey, memberPublicKey, groupId);
  return encryptWithKey(wrappingKey, await serializeGroupMessageKey(groupKey));
}

export async function openGroupKeyForMember(
  memberPrivateKey: string,
  senderPublicKey: string,
  groupId: string,
  encryptedKey: string,
  iv: string,
) {
  const wrappingKey = await deriveConversationKey(memberPrivateKey, senderPublicKey, groupId);
  return importGroupMessageKey(await decryptWithKey(wrappingKey, { ciphertext: encryptedKey, iv }));
}

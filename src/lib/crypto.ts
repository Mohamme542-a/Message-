/**
 * AB — طبقة التشفير
 *
 * كل العمليات تستخدم Web Crypto API القياسي في المتصفح فقط:
 *  - ECDH على منحنى P-256 لاشتقاق مفتاح المحادثة.
 *  - HKDF-SHA256 لاشتقاق مفتاح الجلسة.
 *  - AES-GCM 256-bit لتشفير محتوى الرسائل والملفات.
 *  - PBKDF2-SHA256 (600,000 دورة) لاشتقاق مفتاح تغليف من عبارة المرور/PIN.
 *
 * لم نخترع أي خوارزمية. لم نُنفّذ Double Ratchet — راجع docs/SECURITY.md
 * للحدود المعروفة (Forward Secrecy / Post-Compromise Security).
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export const PBKDF2_ITERATIONS = 600_000;

/* ---------- ترميز ---------- */

export function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromB64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

/* ---------- مفاتيح الهوية / الجهاز (ECDH P-256) ---------- */

export interface KeyPairMaterial {
  publicKey: string; // SPKI base64
  privateKey: string; // PKCS8 base64
}

export async function generateIdentityKeyPair(): Promise<KeyPairMaterial> {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveKey",
    "deriveBits",
  ]);
  const publicKey = toB64(await crypto.subtle.exportKey("spki", pair.publicKey));
  const privateKey = toB64(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  return { publicKey, privateKey };
}

async function importPublicKey(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    bufferSource(fromB64(spkiB64)),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
}

async function importPrivateKey(pkcs8B64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    bufferSource(fromB64(pkcs8B64)),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey", "deriveBits"],
  );
}

/**
 * اشتقاق مفتاح المحادثة: ECDH ثم HKDF-SHA256.
 * salt = معرّف المحادثة حتى يختلف المفتاح بين كل محادثة وأخرى.
 */
export async function deriveConversationKey(
  myPrivateKeyB64: string,
  theirPublicKeyB64: string,
  conversationId: string,
): Promise<CryptoKey> {
  const priv = await importPrivateKey(myPrivateKeyB64);
  const pub = await importPublicKey(theirPublicKeyB64);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: bufferSource(enc.encode(conversationId)),
      info: bufferSource(enc.encode("AB/v1/conversation")),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/* ---------- AES-GCM ---------- */

export interface Ciphertext {
  ciphertext: string;
  iv: string;
}

export async function encryptWithKey(key: CryptoKey, plaintext: string): Promise<Ciphertext> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: bufferSource(iv) },
    key,
    bufferSource(enc.encode(plaintext)),
  );
  return { ciphertext: toB64(ct), iv: toB64(iv) };
}

export async function decryptWithKey(key: CryptoKey, payload: Ciphertext): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bufferSource(fromB64(payload.iv)) },
    key,
    bufferSource(fromB64(payload.ciphertext)),
  );
  return dec.decode(plain);
}

/** تشفير ملف محلياً قبل أي رفع. يعيد البايتات المشفرة + المفتاح الخام. */
export async function encryptFile(
  data: ArrayBuffer,
): Promise<{ encrypted: Uint8Array; keyB64: string; ivB64: string }> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: bufferSource(iv) }, key, data);
  const raw = await crypto.subtle.exportKey("raw", key);
  return { encrypted: new Uint8Array(encrypted), keyB64: toB64(raw), ivB64: toB64(iv) };
}

/* ---------- تغليف بعبارة مرور / PIN ---------- */

export async function deriveWrappingKey(secret: string, saltB64: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", bufferSource(enc.encode(secret)), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: bufferSource(fromB64(saltB64)),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/* ---------- رمز الاسترداد ---------- */

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRecoveryCode(): string {
  const bytes = randomBytes(24);
  const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]);
  return (chars.join("").match(/.{1,4}/g) ?? []).join("-");
}

/* ---------- رقم الأمان (Safety Number) ---------- */

export async function computeSafetyNumber(pubA: string, pubB: string): Promise<string> {
  const [first, second] = [pubA, pubB].sort();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bufferSource(enc.encode(`AB/v1/safety:${first}:${second}`)),
  );
  const bytes = new Uint8Array(digest).slice(0, 30);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += String(bytes[i]! % 10);
  }
  return (out.match(/.{1,5}/g) ?? []).join(" ");
}

export async function fingerprint(publicKeyB64: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bufferSource(fromB64(publicKeyB64)));
  return toB64(digest).slice(0, 16);
}

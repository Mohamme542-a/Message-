const DB_NAME = "alpha-byte-keys";
const DEVICE_KEY = "alpha-byte-device-id";
const LEGACY_IDENTITY_OWNER_KEY = "alpha-byte.legacy-identity-owner";
const RECOVERY_BACKUP_VERSION = "ab-recovery-v1";
const RECOVERY_KDF_ITERATIONS = 300000;

const toB64 = (bytes) => {
  let raw = "";
  new Uint8Array(bytes).forEach(byte => { raw += String.fromCharCode(byte); });
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromB64 = (value) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, character => character.charCodeAt(0));
};

function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys");
      let messages;
      if (!db.objectStoreNames.contains("messages")) {
        messages = db.createObjectStore("messages", { keyPath: "id" });
        messages.createIndex("conversationId", "conversationId", { unique: false });
      } else messages = request.transaction.objectStore("messages");
      if (!messages.indexNames.contains("accountConversation")) messages.createIndex("accountConversation", ["accountScope", "conversationId"], { unique: false });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function getStored(name) {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keys", "readonly");
    const request = tx.objectStore("keys").get(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function putStored(name, value) {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keys", "readwrite");
    tx.objectStore("keys").put(value, name);
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => resolve();
  });
}

const scopeFor = (value) => String(value || "guest").replace(/[^a-zA-Z0-9_-]/g, "_");

const randomId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return toB64(bytes);
};

export async function getDeviceIdentity(accountScope = "guest", options = {}) {
  if (!crypto?.subtle || !indexedDB) throw new Error("CRYPTO_UNAVAILABLE");
  const scope = scopeFor(accountScope);
  const scopedDeviceKey = `${DEVICE_KEY}:${scope}`;
  const scopedIdentityKey = `identity:${scope}`;
  let deviceId = localStorage.getItem(scopedDeviceKey);
  let identity = await getStored(scopedIdentityKey);
  const canMigrateLegacyIdentity = options.allowLegacyMigration === true && !localStorage.getItem(LEGACY_IDENTITY_OWNER_KEY);
  if (!identity && canMigrateLegacyIdentity) {
    const legacyIdentity = await getStored("identity");
    const legacyDeviceId = localStorage.getItem(DEVICE_KEY);
    if (legacyIdentity && legacyDeviceId) {
      identity = legacyIdentity;
      deviceId = legacyDeviceId;
      await putStored(scopedIdentityKey, identity);
      localStorage.setItem(scopedDeviceKey, deviceId);
      localStorage.setItem(LEGACY_IDENTITY_OWNER_KEY, scope);
    }
  }
  if (!deviceId) {
    deviceId = randomId();
    localStorage.setItem(scopedDeviceKey, deviceId);
  }
  if (!identity) {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey", "deriveBits"]);
    const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    identity = { privateKey: pair.privateKey, publicJwk };
    await putStored(scopedIdentityKey, identity);
  }
  return { deviceId, ...identity };
}

async function importPublicKey(jwk) {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, []);
}

async function deriveWrappingKey(privateKey, remotePublicJwk) {
  const remote = await importPublicKey(remotePublicJwk);
  return crypto.subtle.deriveKey({ name: "ECDH", public: remote }, privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encryptBytes(key, source) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, source);
  const output = new Uint8Array(iv.length + ciphertext.byteLength);
  output.set(iv, 0);
  output.set(new Uint8Array(ciphertext), iv.length);
  return output;
}

async function decryptBytes(key, source) {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
}

export async function createConversationKeyMaterial() {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
  return { key, raw };
}

/** Re-wraps a conversation key for an approved member in process memory; this value must never be persisted or sent to the server unwrapped. */
export async function exportConversationKeyRaw(key) {
  return new Uint8Array(await crypto.subtle.exportKey("raw", key));
}

export async function sealConversationKey(rawConversationKey, identity, recipientPublicJwk) {
  const wrappingKey = await deriveWrappingKey(identity.privateKey, recipientPublicJwk);
  const cipher = await encryptBytes(wrappingKey, rawConversationKey);
  return toB64(new TextEncoder().encode(JSON.stringify({ senderPublicJwk: identity.publicJwk, ciphertext: toB64(cipher) })));
}

export async function openConversationKey(sealed, identity) {
  const record = JSON.parse(new TextDecoder().decode(fromB64(sealed)));
  const wrappingKey = await deriveWrappingKey(identity.privateKey, record.senderPublicJwk);
  const rawConversationKey = await decryptBytes(wrappingKey, fromB64(record.ciphertext));
  return crypto.subtle.importKey("raw", rawConversationKey, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

export async function storeConversationKey(accountId, conversationId, key) {
  await putStored(`conversation:${scopeFor(accountId)}:${conversationId}`, key);
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("alpha-byte:conversation-key-stored", { detail: { accountId, conversationId } }));
  }
}

export async function getConversationKey(accountId, conversationId) {
  return getStored(`conversation:${scopeFor(accountId)}:${conversationId}`);
}

function recoveryRecordName(accountId) { return `recovery-key:${scopeFor(accountId)}`; }
function messageLockRecordName(accountId) { return `message-lock:${scopeFor(accountId)}`; }

function normalizedRecoveryKey(value) {
  if (typeof value !== "string") throw new Error("RECOVERY_KEY_REQUIRED");
  const normalized = value.replace(/[\s.]/g, "");
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(normalized)) throw new Error("INVALID_RECOVERY_KEY");
  return normalized;
}

async function deriveRecoveryKey(recoveryKey, salt) {
  const source = await crypto.subtle.importKey("raw", new TextEncoder().encode(normalizedRecoveryKey(recoveryKey)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: RECOVERY_KDF_ITERATIONS, hash: "SHA-256" }, source, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export function createRecoveryKey() {
  const value = toB64(crypto.getRandomValues(new Uint8Array(24)));
  return value.match(/.{1,4}/g).join(".");
}

/** Persists only a non-extractable derived key and public salt on this device; the recovery key itself is never stored. */
export async function unlockRecoveryKey(accountId, recoveryKey, knownSalt) {
  const salt = knownSalt ? fromB64(knownSalt) : crypto.getRandomValues(new Uint8Array(16));
  if (salt.byteLength < 16 || salt.byteLength > 64) throw new Error("INVALID_RECOVERY_SALT");
  const key = await deriveRecoveryKey(recoveryKey, salt);
  const record = { version: RECOVERY_BACKUP_VERSION, kdfSalt: toB64(salt), key };
  await putStored(recoveryRecordName(accountId), record);
  return { version: record.version, kdfSalt: record.kdfSalt };
}

export async function hasUnlockedRecoveryKey(accountId) {
  const record = await getStored(recoveryRecordName(accountId));
  return Boolean(record?.key && record?.version === RECOVERY_BACKUP_VERSION && record?.kdfSalt);
}

async function listConversationKeyRecords(accountId) {
  const db = await openStore();
  const prefix = `conversation:${scopeFor(accountId)}:`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keys", "readonly");
    const store = tx.objectStore("keys");
    const records = [];
    const request = store.openCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve(records);
      if (typeof cursor.key === "string" && cursor.key.startsWith(prefix) && cursor.value && (typeof CryptoKey === "undefined" || cursor.value instanceof CryptoKey)) {
        records.push({ conversationId: cursor.key.slice(prefix.length), key: cursor.value });
      }
      cursor.continue();
    };
  });
}

/** Produces only an AES-GCM ciphertext suitable for the opaque server backup endpoint. */
export async function createEncryptedRecoveryBackup(accountId) {
  const record = await getStored(recoveryRecordName(accountId));
  if (!record?.key || record.version !== RECOVERY_BACKUP_VERSION || typeof record.kdfSalt !== "string") return undefined;
  const keys = await listConversationKeyRecords(accountId);
  const conversationKeys = [];
  for (const item of keys) conversationKeys.push({ conversationId: item.conversationId, rawKey: toB64(await crypto.subtle.exportKey("raw", item.key)) });
  const encryptedBackup = await encryptJson(record.key, { version: RECOVERY_BACKUP_VERSION, accountScope: scopeFor(accountId), createdAt: Date.now(), conversationKeys });
  return { backupVersion: RECOVERY_BACKUP_VERSION, kdfSalt: record.kdfSalt, encryptedBackup };
}

export async function restoreEncryptedRecoveryBackup(accountId, recoveryKey, backup) {
  if (!backup || backup.backupVersion !== RECOVERY_BACKUP_VERSION || typeof backup.kdfSalt !== "string" || typeof backup.encryptedBackup !== "string") throw new Error("INVALID_RECOVERY_BACKUP");
  await unlockRecoveryKey(accountId, recoveryKey, backup.kdfSalt);
  const record = await getStored(recoveryRecordName(accountId));
  const decoded = await decryptJson(record.key, backup.encryptedBackup);
  if (!decoded || decoded.version !== RECOVERY_BACKUP_VERSION || decoded.accountScope !== scopeFor(accountId) || !Array.isArray(decoded.conversationKeys)) throw new Error("RECOVERY_BACKUP_ACCOUNT_MISMATCH");
  let restored = 0;
  for (const item of decoded.conversationKeys) {
    if (!item || typeof item.conversationId !== "string" || !/^[A-Za-z0-9_-]{8,96}$/.test(item.conversationId) || typeof item.rawKey !== "string") continue;
    const rawKey = fromB64(item.rawKey);
    if (rawKey.byteLength !== 32) continue;
    await storeConversationKey(accountId, item.conversationId, await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]));
    restored += 1;
  }
  return restored;
}

/** Deletes keys and cached ciphertext only from the current device and account scope. */
export async function deleteLocalConversationData(accountId, conversationId) {
  const scopedAccount = scopeFor(accountId);
  const db = await openStore();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["keys", "messages"], "readwrite");
    tx.objectStore("keys").delete(`conversation:${scopedAccount}:${conversationId}`);
    const messages = tx.objectStore("messages");
    const request = messages.index("accountConversation").openCursor(IDBKeyRange.only([scopedAccount, conversationId]));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.delete(); cursor.continue(); } };
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => resolve();
  });
}

async function messageLockDigest(code, salt) {
  if (typeof code !== "string" || !/^\d{6,32}$/.test(code)) throw new Error("INVALID_MESSAGE_LOCK_CODE");
  const source = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" }, source, 256);
  return toB64(bits);
}

/** Local-only application lock; this is not an account credential, recovery secret, or a replacement for native secure storage. */
export async function hasMessageLockCode(accountId) {
  return Boolean(await getStored(messageLockRecordName(accountId)));
}

export async function setMessageLockCode(accountId, code) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await putStored(messageLockRecordName(accountId), { salt: toB64(salt), digest: await messageLockDigest(code, salt) });
}

export async function verifyMessageLockCode(accountId, code) {
  const record = await getStored(messageLockRecordName(accountId));
  if (!record?.salt || !record?.digest) return false;
  return (await messageLockDigest(code, fromB64(record.salt))) === record.digest;
}

/** Stores ciphertext envelopes only; cleartext is decrypted in memory by the caller. */
export async function cacheCiphertextMessages(accountId, conversationId, envelopes) {
  const db = await openStore();
  const now = Date.now();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("messages", "readwrite");
    const store = tx.objectStore("messages");
    for (const envelope of envelopes) {
      if (!envelope?.id || envelope.conversationId && envelope.conversationId !== conversationId) continue;
      if (envelope.expiresAt && new Date(envelope.expiresAt).getTime() <= now) {
        store.delete(`${scopeFor(accountId)}:${envelope.id}`);
      } else {
        store.put({ id: `${scopeFor(accountId)}:${envelope.id}`, accountScope: scopeFor(accountId), conversationId, envelope, cachedAt: now, expiresAt: envelope.expiresAt || null });
      }
    }
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => resolve();
  });
}

/** Removes one ciphertext envelope from this account's local cache without affecting the conversation key. */
export async function deleteCachedCiphertextMessage(accountId, messageId) {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("messages", "readwrite");
    tx.objectStore("messages").delete(`${scopeFor(accountId)}:${messageId}`);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
  });
}

/** Returns unexpired ciphertext cached on this device and removes any locally expired copies. */
export async function getCachedCiphertextMessages(accountId, conversationId) {
  const db = await openStore();
  const now = Date.now();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("messages", "readwrite");
    const store = tx.objectStore("messages");
    const request = store.index("accountConversation").getAll(IDBKeyRange.only([scopeFor(accountId), conversationId]));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const records = request.result || [];
      const active = [];
      for (const record of records) {
        if (record.expiresAt && new Date(record.expiresAt).getTime() <= now) store.delete(record.id);
        else active.push(record.envelope);
      }
      tx.oncomplete = () => resolve(active.sort((a, b) => new Date(a.serverReceivedAt || 0) - new Date(b.serverReceivedAt || 0)));
    };
    tx.onabort = () => reject(tx.error);
  });
}

export async function encryptJson(key, value) {
  return toB64(await encryptBytes(key, new TextEncoder().encode(JSON.stringify(value))));
}

export async function decryptJson(key, value) {
  const plaintext = await decryptBytes(key, fromB64(value));
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export async function encryptFile(key, file) {
  return new Uint8Array(await encryptBytes(key, await file.arrayBuffer()));
}

export async function decryptFile(key, encryptedBytes) {
  return new Uint8Array(await decryptBytes(key, encryptedBytes));
}

export { toB64, fromB64 };

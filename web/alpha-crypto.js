const DB_NAME = "alpha-byte-keys";
const DEVICE_KEY = "alpha-byte-device-id";
const LEGACY_IDENTITY_OWNER_KEY = "alpha-byte.legacy-identity-owner";

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
}

export async function getConversationKey(accountId, conversationId) {
  return getStored(`conversation:${scopeFor(accountId)}:${conversationId}`);
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

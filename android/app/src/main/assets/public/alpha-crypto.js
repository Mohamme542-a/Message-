const DB_NAME = "alpha-byte-keys";
const DEVICE_KEY = "alpha-byte-device-id";

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
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("keys");
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

const randomId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return toB64(bytes);
};

export async function getDeviceIdentity() {
  if (!crypto?.subtle || !indexedDB) throw new Error("CRYPTO_UNAVAILABLE");
  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = randomId();
    localStorage.setItem(DEVICE_KEY, deviceId);
  }
  let identity = await getStored("identity");
  if (!identity) {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey", "deriveBits"]);
    const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    identity = { privateKey: pair.privateKey, publicJwk };
    await putStored("identity", identity);
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
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return { key, raw };
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
  return crypto.subtle.importKey("raw", rawConversationKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function storeConversationKey(conversationId, key) {
  await putStored(`conversation:${conversationId}`, key);
}

export async function getConversationKey(conversationId) {
  return getStored(`conversation:${conversationId}`);
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

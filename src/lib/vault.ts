/**
 * AB — الخزنة المحلية للمفاتيح.
 *
 * المفتاح الخاص لا يغادر الجهاز أبداً. يُخزَّن في localStorage مغلّفاً
 * بمفتاح AES-GCM مشتق من عبارة المرور (PBKDF2). عند تفعيل PIN، نخزّن
 * نسخة ثانية مغلّفة بمفتاح مشتق من الـPIN لفتح التطبيق بسرعة.
 *
 * تحذير مقصود: لا يوجد أي نسخة من المفتاح الخاص على الخادم. فقدان عبارة
 * المرور ورمز الاسترداد معاً = فقدان القدرة على فك تشفير الرسائل.
 */
import {
  decryptWithKey,
  deriveWrappingKey,
  encryptWithKey,
  randomBytes,
  toB64,
  type Ciphertext,
} from "./crypto";

const VAULT_KEY = "ab.vault.v1";
const PIN_KEY = "ab.vault.pin.v1";
const SETTINGS_KEY = "ab.settings.v1";
const OUTBOX_KEY = "ab.outbox.v1";

export interface VaultContents {
  userId: string;
  username: string;
  deviceId: string;
  deviceName: string;
  identityPublicKey: string;
  identityPrivateKey: string;
  recoveryCodeHint: string;
  createdAt: string;
}

interface WrappedVault {
  v: 1;
  salt: string;
  payload: Ciphertext;
}

function isBrowser() {
  return typeof window !== "undefined";
}

function read<T>(key: string): T | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function vaultExists(): boolean {
  return read<WrappedVault>(VAULT_KEY) !== null;
}

export function pinEnabled(): boolean {
  return read<WrappedVault>(PIN_KEY) !== null;
}

async function seal(secret: string, contents: VaultContents): Promise<WrappedVault> {
  const salt = toB64(randomBytes(16));
  const key = await deriveWrappingKey(secret, salt);
  const payload = await encryptWithKey(key, JSON.stringify(contents));
  return { v: 1, salt, payload };
}

async function open(secret: string, wrapped: WrappedVault): Promise<VaultContents> {
  const key = await deriveWrappingKey(secret, wrapped.salt);
  return JSON.parse(await decryptWithKey(key, wrapped.payload)) as VaultContents;
}

export async function createVault(passphrase: string, contents: VaultContents): Promise<void> {
  write(VAULT_KEY, await seal(passphrase, contents));
}

export async function unlockWithPassphrase(passphrase: string): Promise<VaultContents> {
  const wrapped = read<WrappedVault>(VAULT_KEY);
  if (!wrapped) throw new Error("NO_VAULT");
  return open(passphrase, wrapped);
}

export async function unlockWithPin(pin: string): Promise<VaultContents> {
  const wrapped = read<WrappedVault>(PIN_KEY);
  if (!wrapped) throw new Error("NO_PIN");
  return open(pin, wrapped);
}

export async function enablePin(pin: string, contents: VaultContents): Promise<void> {
  write(PIN_KEY, await seal(pin, contents));
}

export function disablePin(): void {
  if (isBrowser()) window.localStorage.removeItem(PIN_KEY);
}

/** إتلاف كل المفاتيح المحلية — لا رجعة فيه. */
export function destroyLocalKeys(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(VAULT_KEY);
  window.localStorage.removeItem(PIN_KEY);
  window.localStorage.removeItem(OUTBOX_KEY);
}

export function clearLocalDatabase(): void {
  if (!isBrowser()) return;
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith("ab.")) window.localStorage.removeItem(key);
  }
}

/* ---------- الإعدادات المحلية ---------- */

export interface LocalSettings {
  autoLockMinutes: number;
  hideNotificationContent: boolean;
  blockScreenshots: boolean;
  emergencyWipeOnPanic: boolean;
  language: "ar" | "en";
  theme: "dark" | "light" | "system";
  failedUnlockAttempts: number;
}

export const defaultSettings: LocalSettings = {
  autoLockMinutes: 5,
  hideNotificationContent: true,
  blockScreenshots: true,
  emergencyWipeOnPanic: false,
  language: "ar",
  theme: "dark",
  failedUnlockAttempts: 0,
};

export function loadSettings(): LocalSettings {
  return { ...defaultSettings, ...(read<Partial<LocalSettings>>(SETTINGS_KEY) ?? {}) };
}

export function saveSettings(settings: LocalSettings): void {
  write(SETTINGS_KEY, settings);
}

/* ---------- صندوق الصادر دون اتصال ---------- */

export interface OutboxItem {
  id: string;
  conversationId: string;
  ciphertext: string;
  iv: string;
  kind: string;
  createdAt: string;
  expiresAt: string | null;
}

export function loadOutbox(): OutboxItem[] {
  return read<OutboxItem[]>(OUTBOX_KEY) ?? [];
}

export function saveOutbox(items: OutboxItem[]): void {
  write(OUTBOX_KEY, items);
}

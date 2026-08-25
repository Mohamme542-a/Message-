import { Capacitor } from "@capacitor/core";

const storageKey = "alpha-byte.activation-token";
const nativeActivationOrigin = "https://abmessenger-miwecp5v.manus.space";

function apiOrigin() {
  if (typeof window === "undefined") return nativeActivationOrigin;
  return Capacitor.isNativePlatform() ? nativeActivationOrigin : window.location.origin;
}

function endpoint(path: string) {
  return new URL(path, apiOrigin()).toString();
}

export function getActivationToken() {
  return localStorage.getItem(storageKey);
}

export async function validateActivation() {
  const token = getActivationToken();
  if (!token) return false;

  try {
    const response = await fetch(endpoint("/api/activation/status"), {
      method: "POST",
      headers: { "X-Alpha-Activation-Token": token },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function activateWithCode(code: string) {
  const response = await fetch(endpoint("/api/activation/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  const result = (await response.json().catch(() => null)) as { ok?: boolean; token?: string } | null;
  if (!response.ok || !result?.ok || !result.token) {
    throw new Error("INVALID_ACTIVATION_CODE");
  }

  localStorage.setItem(storageKey, result.token);
}

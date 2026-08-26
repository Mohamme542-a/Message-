import { Capacitor, registerPlugin } from "@capacitor/core";

type MicrophonePermissionPlugin = {
  request(): Promise<{ status: "granted" | "denied" }>;
  getStatus(): Promise<{ status: "granted" | "denied" }>;
  startCapture(): Promise<{ status: "started" }>;
  stopCapture(): Promise<{ base64: string; mimeType: string; filename: string }>;
};

const NativeMicrophonePermission = registerPlugin<MicrophonePermissionPlugin>("MicrophonePermission");

function errorText(error: unknown) {
  return String((error as { message?: string })?.message ?? error ?? "").toLowerCase();
}

function isMissingNativeMethod(error: unknown) {
  const message = errorText(error);
  return message.includes("not implemented") || message.includes("not available") || message.includes("does not exist") || message.includes("unimplemented");
}

async function requestNativeMicrophonePermission() {
  try {
    const current = await NativeMicrophonePermission.getStatus();
    if (current.status === "granted") return;
    const permission = await NativeMicrophonePermission.request();
    if (permission.status !== "granted") throw new Error("MICROPHONE_DENIED");
  } catch (error) {
    if (String((error as { message?: string })?.message ?? error).includes("MICROPHONE_DENIED")) throw error;
    if (!isMissingNativeMethod(error)) throw error;
  }
}

/**
 * Uses the native recorder where it is present. Returning false keeps a compatible
 * fallback for older installed APKs that have not yet received the recorder bridge.
 */
export async function startNativeVoiceCapture() {
  if (!Capacitor.isNativePlatform()) return false;
  await requestNativeMicrophonePermission();
  try {
    const result = await NativeMicrophonePermission.startCapture();
    return result.status === "started";
  } catch (error) {
    if (isMissingNativeMethod(error)) return false;
    throw error;
  }
}

export async function finishNativeVoiceCapture() {
  const capture = await NativeMicrophonePermission.stopCapture();
  if (!capture.base64) throw new Error("MICROPHONE_EMPTY_CAPTURE");
  const binary = window.atob(capture.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], capture.filename || `رسالة-صوتية-${Date.now()}.m4a`, { type: capture.mimeType || "audio/mp4" });
}

export async function beginVoiceCapture(): Promise<MediaStream> {
  if (Capacitor.isNativePlatform()) {
    // The native bridge is a permission helper, not the audio source. If an older
    // installed WebView does not expose the helper, continue to the standard
    // getUserMedia permission flow instead of reporting a false denial.
    await requestNativeMicrophonePermission();
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("MICROPHONE_UNAVAILABLE");
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: { ideal: true }, noiseSuppression: { ideal: true }, autoGainControl: { ideal: true } },
      video: false,
    });
  } catch (error) {
    // Some Android WebView implementations reject enhanced constraints despite a granted permission.
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      throw error;
    }
  }
}

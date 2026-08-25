import { Capacitor, registerPlugin } from "@capacitor/core";

type MicrophonePermissionPlugin = {
  request(): Promise<{ status: "granted" | "denied" }>;
};

const NativeMicrophonePermission = registerPlugin<MicrophonePermissionPlugin>("MicrophonePermission");

export async function beginVoiceCapture(): Promise<MediaStream> {
  if (Capacitor.isNativePlatform()) {
    const permission = await NativeMicrophonePermission.request();
    if (permission.status !== "granted") throw new Error("MICROPHONE_DENIED");
  }
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("MICROPHONE_UNAVAILABLE");
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
}

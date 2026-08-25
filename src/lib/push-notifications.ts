import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

import { supabase } from "@/integrations/supabase/client";

export async function registerPushNotifications(
  userId: string,
  deviceId: string,
  onForegroundMessage: () => void,
) {
  if (!Capacitor.isNativePlatform() || !userId || !deviceId) return () => {};

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") return () => {};

  const registration = await PushNotifications.addListener("registration", async ({ value }) => {
    await supabase
      .from("devices")
      .update({ fcm_token: value, platform: Capacitor.getPlatform(), last_active: new Date().toISOString() })
      .eq("id", deviceId)
      .eq("user_id", userId);
  });
  const foreground = await PushNotifications.addListener("pushNotificationReceived", () => onForegroundMessage());
  await PushNotifications.register();

  return () => {
    void registration.remove();
    void foreground.remove();
  };
}

export async function notifyPeerOfNewMessage(accessToken: string, messageId: string) {
  if (!Capacitor.isNativePlatform() || !accessToken || !messageId) return;
  await fetch("https://abmessenger-miwecp5v.manus.space/api/notifications/message", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messageId }),
  });
}

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";

import { supabase } from "@/integrations/supabase/client";

export async function registerPushNotifications(
  userId: string,
  deviceId: string,
  onForegroundMessage: () => void,
) {
  if (!Capacitor.isNativePlatform() || !userId || !deviceId) return () => {};

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") return () => {};

  const localPermission = await LocalNotifications.requestPermissions();
  if (localPermission.display !== "granted") return () => {};

  await LocalNotifications.createChannel({
    id: "alpha_byte_messages",
    name: "رسائل Alpha Byte",
    description: "تنبيهات الرسائل الجديدة",
    importance: 5,
    visibility: 0,
    vibration: true,
  });

  const registration = await PushNotifications.addListener("registration", async ({ value }) => {
    await supabase
      .from("devices")
      .update({ fcm_token: value, platform: Capacitor.getPlatform(), last_active: new Date().toISOString() })
      .eq("id", deviceId)
      .eq("user_id", userId);
  });
  const foreground = await PushNotifications.addListener("pushNotificationReceived", () => {
    onForegroundMessage();
  });
  await PushNotifications.register();

  return () => {
    void registration.remove();
    void foreground.remove();
  };
}

export async function notifyPeerOfNewMessage(accessToken: string, messageId: string) {
  if (!Capacitor.isNativePlatform() || !accessToken || !messageId) return;
  const response = await fetch("https://abmessenger-miwecp5v.manus.space/api/notifications/message", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messageId }),
  });
  if (!response.ok) throw new Error("PUSH_DELIVERY_FAILED");
}

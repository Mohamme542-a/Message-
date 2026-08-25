import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // Must match the Android package registered in the supplied Firebase configuration.
  appId: "Com.qarfash",
  appName: "Alpha Byte",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
    allowNavigation: ["abmessenger-miwecp5v.manus.space"],
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert", "banner", "list"],
    },
    LocalNotifications: {
      smallIcon: "ic_stat_ab",
      iconColor: "#111111",
    },
  },
};

export default config;

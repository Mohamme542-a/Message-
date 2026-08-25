import type { CapacitorConfig } from "@capacitor/cli";

const isAdminEdition = process.env.AB_APP_EDITION === "admin";

const config: CapacitorConfig = {
  // Must match the Android package registered in the supplied Firebase configuration.
  appId: isAdminEdition ? "Com.qarfash.admin" : "Com.qarfash",
  appName: isAdminEdition ? "Alpha Byte Admin" : "Alpha Byte",
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

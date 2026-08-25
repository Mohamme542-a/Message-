import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.alphabyte.messenger",
  appName: "Alpha Byte",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
    allowNavigation: ["abmessenger-miwecp5v.manus.space"],
  },
};

export default config;

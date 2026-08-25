// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss(), tsconfigPaths()],
  server: { host: true },
  preview: { allowedHosts: true },
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
  },
});

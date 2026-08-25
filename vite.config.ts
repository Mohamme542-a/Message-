// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  preview: { allowedHosts: true },
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
  },
});

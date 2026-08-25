import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = import.meta.dirname;

describe("Alpha Byte imported-project identity", () => {
  it("uses Alpha Byte on exterior screens while retaining the supplied Supabase client", async () => {
    const [rootRoute, splash, auth, client] = await Promise.all([
      readFile(path.join(root, "routes/__root.tsx"), "utf8"),
      readFile(path.join(root, "routes/index.tsx"), "utf8"),
      readFile(path.join(root, "routes/auth.tsx"), "utf8"),
      readFile(path.join(root, "integrations/supabase/client.ts"), "utf8"),
    ]);
    expect(rootRoute).toContain("Alpha Byte");
    expect(splash).toContain("alpha-byte-cover");
    expect(auth).toContain("alpha-byte-cover");
    expect(client).toContain("VITE_SUPABASE_URL");
    expect(client).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
    expect(client).not.toContain("service_role");
  });

  it("publishes a client-rendered static payload to dist/public", async () => {
    const outputDirectory = path.join(root, "..", "dist", "public");
    const [html, packageJson, viteConfig, assets] = await Promise.all([
      readFile(path.join(outputDirectory, "index.html"), "utf8"),
      readFile(path.join(root, "..", "package.json"), "utf8"),
      readFile(path.join(root, "..", "vite.config.ts"), "utf8"),
      readdir(path.join(outputDirectory, "assets")),
    ]);

    expect(packageJson).toContain('"build": "vite build"');
    expect(viteConfig).toContain('outDir: "dist/public"');
    expect(html).toContain('<div id="root"></div>');
    expect(html).toMatch(/assets\/index-[\w-]+\.js/);
    expect(html).toMatch(/assets\/styles-[\w-]+\.css/);
    expect(assets.some((asset) => asset.endsWith(".js"))).toBe(true);
    expect(assets.some((asset) => asset.endsWith(".css"))).toBe(true);
  });
});

import { readFile } from "node:fs/promises";
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
});

import { describe, expect, it } from "vitest";

import { PREMIUM_STICKERS } from "@/lib/premium-stickers";

describe("Alpha Byte premium stickers", () => {
  it("contains distinct, renderable sticker assets", () => {
    expect(PREMIUM_STICKERS).toHaveLength(5);
    expect(new Set(PREMIUM_STICKERS.map((sticker) => sticker.id)).size).toBe(5);
    expect(new Set(PREMIUM_STICKERS.map((sticker) => sticker.src)).size).toBe(5);
    expect(PREMIUM_STICKERS.every((sticker) => sticker.src.startsWith("data:image/svg+xml"))).toBe(true);
  });
});

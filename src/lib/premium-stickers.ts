export type PremiumSticker = {
  id: "bytey-love" | "bytey-laugh" | "bytey-wow" | "bytey-angry" | "bytey-party";
  label: string;
  src: string;
};

function stickerSvg(content: string, accent: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${accent}"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><rect x="8" y="8" width="144" height="144" rx="44" fill="url(#g)"/><circle cx="80" cy="78" r="49" fill="#fff" fill-opacity=".96"/>${content}<path d="M45 128c20 12 50 12 70 0" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/></svg>`;
  // Base64 avoids URI-decoding defects seen in several Android WebView builds.
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export const PREMIUM_STICKERS: PremiumSticker[] = [
  { id: "bytey-love", label: "محبة", src: stickerSvg('<circle cx="62" cy="70" r="7" fill="#111"/><circle cx="98" cy="70" r="7" fill="#111"/><path d="M53 94c15 18 39 18 54 0" fill="none" stroke="#ef4444" stroke-width="7" stroke-linecap="round"/><path d="M80 25c8-17 30-6 18 8L80 49 62 33c-12-14 10-25 18-8Z" fill="#ef4444"/>', "#ec4899") },
  { id: "bytey-laugh", label: "ضحك", src: stickerSvg('<circle cx="62" cy="68" r="7" fill="#111"/><circle cx="98" cy="68" r="7" fill="#111"/><path d="M48 91c19 28 45 28 64 0" fill="#111"/><path d="M58 101c14 8 30 8 44 0" fill="#f87171"/>', "#f59e0b") },
  { id: "bytey-wow", label: "مذهول", src: stickerSvg('<circle cx="62" cy="67" r="10" fill="#111"/><circle cx="98" cy="67" r="10" fill="#111"/><circle cx="62" cy="64" r="3" fill="#fff"/><circle cx="98" cy="64" r="3" fill="#fff"/><ellipse cx="80" cy="101" rx="13" ry="18" fill="#111"/><path d="M45 48c8-12 18-14 28-11M87 37c10-3 20 0 28 11" fill="none" stroke="#111" stroke-width="6" stroke-linecap="round"/>', "#06b6d4") },
  { id: "bytey-angry", label: "غاضب", src: stickerSvg('<path d="M49 61l25 10M111 61L86 71" stroke="#111" stroke-width="8" stroke-linecap="round"/><circle cx="62" cy="78" r="7" fill="#111"/><circle cx="98" cy="78" r="7" fill="#111"/><path d="M57 108c15-13 31-13 46 0" fill="none" stroke="#ef4444" stroke-width="7" stroke-linecap="round"/><path d="M36 38l-12-12M124 38l12-12" stroke="#ef4444" stroke-width="7" stroke-linecap="round"/>', "#ef4444") },
  { id: "bytey-party", label: "احتفال", src: stickerSvg('<circle cx="62" cy="75" r="8" fill="#111"/><circle cx="98" cy="75" r="8" fill="#111"/><path d="M54 98c14 18 38 18 52 0" fill="none" stroke="#111" stroke-width="7" stroke-linecap="round"/><path d="M32 34l8 10 12-3-6 11 7 10-13-3-8 10-1-13-12-6 12-5Z" fill="#facc15"/><path d="M128 34l-8 10-12-3 6 11-7 10 13-3 8 10 1-13 12-6-12-5Z" fill="#a855f7"/>', "#8b5cf6") },
];

export function getPremiumSticker(id: string | null | undefined) {
  return PREMIUM_STICKERS.find((sticker) => sticker.id === id) ?? null;
}

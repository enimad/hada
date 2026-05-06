const LOW_VALUE_IMAGE_PATTERN =
  /(logo|icon|favicon|sprite|placeholder|blank|avatar|pictogram|badge|seal|marker|map|loading|spinner|pixel|tracking|transparent)/i;

const IMAGE_EXTENSION_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i;
const REJECTED_EXTENSION_PATTERN = /\.(?:svg|ico|pdf|css|js|json|xml|txt)(?:[?#].*)?$/i;

export function normalizeDisplayImageUrl(value: unknown, baseUrl?: string | null) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value.trim(), baseUrl ?? undefined);
    if (!["http:", "https:"].includes(url.protocol)) return null;

    const normalized = url.toString();
    if (url.hostname.replace(/^www\./, "") === "example.com") return null;
    if (LOW_VALUE_IMAGE_PATTERN.test(normalized)) return null;
    if (REJECTED_EXTENSION_PATTERN.test(url.pathname)) return null;

    return normalized;
  } catch {
    return null;
  }
}

export function collectDisplayImageUrls(values: unknown[], baseUrl?: string | null, limit = 8) {
  const images: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const url = normalizeDisplayImageUrl(value, baseUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    images.push(url);
    if (images.length >= limit) break;
  }

  return images;
}

export function isLikelyImageUrl(value: string) {
  return IMAGE_EXTENSION_PATTERN.test(value) && !LOW_VALUE_IMAGE_PATTERN.test(value);
}

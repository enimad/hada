const BLOCKED_WEDDING_DIRECTORY_HOSTS = [
  "mariages.net",
  "theknot.com",
  "zankyou.fr",
  "matrimonio.com",
  "mariagenet.com",
  "lesmariables.fr",
  "checkmarket.com",
  "wedinspire.com",
  "weddingwire.com",
  "weddingwire.fr",
  "hitched.co.uk",
  "bridebook.com",
  "mariée.fr",
  "xn--marie-fsa.fr",
  "xn--marie-esa.fr",
  "monmariage.com",
  "mariage.fr",
  "marions-nous.fr",
  "hellocoton.fr",
  "lesjeudis.com",
  "futursepoux.fr",
  "lemariagedanstoussesetats.fr",
  "jeunes-maries.com",
  "leblogdemadamec.fr",
  "la-mariee-aux-pieds-nus.fr"
];

export function isBlockedWeddingDirectoryUrl(value: string | null | undefined) {
  const host = extractHost(value);
  return isBlockedWeddingDirectoryHost(host);
}

export function isBlockedWeddingDirectoryHost(value: string | null | undefined) {
  const host = normalizeHost(value);
  if (!host) return false;
  return BLOCKED_WEDDING_DIRECTORY_HOSTS.some((blockedHost) => host === blockedHost || host.endsWith(`.${blockedHost}`));
}

function extractHost(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).hostname;
  } catch {
    try {
      return new URL(`https://${trimmed}`).hostname;
    } catch {
      return trimmed.split(/[/?#]/)[0] ?? null;
    }
  }
}

function normalizeHost(value: string | null | undefined) {
  return value
    ?.trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "") ?? null;
}

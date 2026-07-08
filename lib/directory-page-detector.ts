import { isBlockedWeddingDirectoryUrl } from "@/lib/blocked-vendor-sources";

/**
 * Détecteur structurel de pages d'annuaires / agrégateurs de prestataires.
 *
 * Objectif produit : une fiche prestataire ne peut être créée que depuis le
 * site du prestataire lui-même (portfolio, site vitrine). Ce module est la
 * source de vérité partagée entre la recherche Firecrawl, le normalizer,
 * les portes de création/cache (hada.ts), l'affichage (/api/vendors) et les
 * scripts de test/purge.
 *
 * Trois familles de signaux, combinées par looksLikeDirectoryPage :
 * - host : blocklist explicite + formes de hostname génériques (annuaire*, zankyou.*, ...)
 * - forme d'URL : chemins typiques de listings (/annuaire/, /prestataires/, /recherche/...)
 * - forme de titre/description : « Les 10 meilleurs... », « Comparez les devis »...
 *
 * Les motifs sont volontairement conservateurs côté rappel : /mariage/, « devis
 * gratuit » ou /salle-de-reception seuls ne suffisent pas (pages légitimes de
 * prestataires). Chaque motif est couvert par les fixtures de
 * scripts/test-directory-detector.mjs.
 */

export type PageSignals = {
  url: string;
  title?: string | null;
  description?: string | null;
};

export function looksLikeDirectoryPage(signals: PageSignals): boolean {
  const url = signals.url?.trim();
  if (!url) return false;

  if (isBlockedWeddingDirectoryUrl(url)) return true;
  if (isGenericDirectoryHost(extractHostname(url))) return true;
  if (hasDirectoryUrlShape(url)) return true;

  const text = [signals.title, signals.description].filter(Boolean).join(" ");
  if (text && hasDirectoryTitleShape(text)) return true;

  return false;
}

/** Formes de hostname typiques d'annuaires, indépendantes de la blocklist. */
export function isGenericDirectoryHost(host: string | null | undefined): boolean {
  const normalized = normalizeHost(host);
  if (!normalized) return false;

  return (
    /(^|\.)(annuaire[\w-]*|[\w-]+-annuaire[\w-]*)\./.test(normalized) ||
    /(^|\.)zankyou\./.test(normalized) ||
    /pagesjaunes\.|pages-jaunes\./.test(normalized) ||
    /(^|\.)yelp\./.test(normalized) ||
    /(^|\.)tripadvisor\./.test(normalized) ||
    /(^|\.)leboncoin\.fr$/.test(normalized) ||
    /(^|\.)(directory|listings?)\./.test(normalized) ||
    /comparateur|comparatif/.test(normalized) ||
    /(^|\.)google\.[a-z.]+$/.test(normalized) ||
    /(^|\.)bing\.com$/.test(normalized)
  );
}

/** Chemins et query strings typiques de pages de listing / fiches d'annuaire. */
export function hasDirectoryUrlShape(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  const target = `${parsed.pathname}${parsed.search}`.toLowerCase();

  return (
    /(^|\/)annuaires?(\/|-|$)/.test(target) ||
    /\/(prestataires?|professionnels?|entreprises|fournisseurs)(\/|\?|$)/.test(target) ||
    /\/(recherche|resultats?|search|listings?|directory|vendors?)(\/|\?|$)/.test(target) ||
    /\/(categorie|categories|category)\//.test(target) ||
    /\/(villes?|regions?|departements?)\//.test(target) ||
    /\/(top-\d|les-meilleurs|meilleurs-|comparatif|comparateur|classement|guide-des)/.test(target) ||
    /\/(profil|profile|fiche)\/./.test(target) ||
    /[?&](ville|region|departement|categorie|cat)=/.test(target)
  );
}

/** Titres/descriptions de pages multi-prestataires (listings, comparateurs). */
export function hasDirectoryTitleShape(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;

  return (
    /\bles \d+ meilleur/.test(normalized) ||
    /\btop \d+\b/.test(normalized) ||
    // Pluriel uniquement : « meilleurs traiteurs de Lyon » = listing, mais un
    // prestataire peut légitimement se dire « élu meilleur traiteur de Lyon ».
    /\bmeilleurs \w+ (a|en|de|du|dans|pour) /.test(normalized) ||
    /\bannuaire\b/.test(normalized) ||
    /\bcomparateur\b|\bcomparatif\b|\bcomparez\b/.test(normalized) ||
    /\bliste (des|de)\b/.test(normalized) ||
    /\bclassement\b/.test(normalized) ||
    /\bselection (des|de)\b/.test(normalized) ||
    /\btrouvez (votre|un|une|le|la|les)\b/.test(normalized) ||
    /\btou(s|tes) les (traiteurs|photographes|videastes|djs?|lieux|salles|fleuristes|prestataires|robes|domaines)\b/.test(normalized) ||
    /\b\d+ (lieux|salles|traiteurs|photographes|videastes|djs?|fleuristes|prestataires|domaines|chateaux)\b/.test(normalized) ||
    /\bprix (et|,) (photos|avis)\b/.test(normalized) ||
    /\b(avis|photos) et devis\b/.test(normalized) ||
    /\bdemandez? des devis\b/.test(normalized)
  );
}

function extractHostname(url: string): string | null {
  return parseUrl(url)?.hostname ?? null;
}

function parseUrl(value: string): URL | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
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

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

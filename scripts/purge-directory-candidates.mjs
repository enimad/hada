/**
 * Purge one-shot des fiches prestataires issues de pages d'annuaires
 * (table vendor_candidates).
 *
 * Usage :
 *   npm run purge:directory            → DRY-RUN : liste ce qui serait supprimé
 *   npm run purge:directory -- --apply → supprime réellement (cascade sur vendor_events)
 *
 * Critères de purge (mêmes règles que les portes de prod) :
 *   - metadata_json.sourceType === "directory"
 *   - source_url ou website détecté structurellement comme page d'annuaire
 */
import { createRequire } from "node:module";
import { loadDirectoryDetector, loadEnvLocal } from "./lib-loader.mjs";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant (.env.local).");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const { looksLikeDirectoryPage } = loadDirectoryDetector();
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const PAGE_SIZE = 500;
const toPurge = [];
let scanned = 0;

for (let offset = 0; ; offset += PAGE_SIZE) {
  const { data, error } = await supabase
    .from("vendor_candidates")
    .select("id, name, category, source_url, website, metadata_json, created_at")
    .order("created_at", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    console.error("Lecture vendor_candidates impossible :", error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) break;

  for (const candidate of data) {
    scanned += 1;
    const sourceType = candidate.metadata_json?.sourceType ?? null;
    const reasons = [];
    if (sourceType === "directory") reasons.push("sourceType=directory");
    if (candidate.source_url && looksLikeDirectoryPage({ url: candidate.source_url })) reasons.push(`source_url annuaire (${candidate.source_url})`);
    if (candidate.website && looksLikeDirectoryPage({ url: candidate.website })) reasons.push(`website annuaire (${candidate.website})`);
    if (reasons.length > 0) toPurge.push({ id: candidate.id, name: candidate.name, category: candidate.category, reasons });
  }

  if (data.length < PAGE_SIZE) break;
}

console.log(`${scanned} fiches analysées, ${toPurge.length} identifiées comme issues d'annuaires.\n`);
for (const item of toPurge) {
  console.log(`- [${item.category}] ${item.name} (${item.id})\n    ${item.reasons.join("\n    ")}`);
}

if (toPurge.length === 0) {
  console.log("Rien à purger.");
  process.exit(0);
}

if (!apply) {
  console.log(`\nDRY-RUN : aucune suppression effectuée. Relance avec --apply pour supprimer ces ${toPurge.length} fiches.`);
  process.exit(0);
}

const ids = toPurge.map((item) => item.id);
let deleted = 0;
for (let i = 0; i < ids.length; i += 100) {
  const chunk = ids.slice(i, i + 100);
  const { error } = await supabase.from("vendor_candidates").delete().in("id", chunk);
  if (error) {
    console.error(`Suppression échouée (chunk ${i / 100 + 1}) :`, error.message);
    process.exit(1);
  }
  deleted += chunk.length;
}

console.log(`\n${deleted} fiches annuaires supprimées (vendor_events associés supprimés en cascade).`);

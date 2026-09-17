import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { createServerModuleLoader } from "./server-module-loader.mjs";
import { createMemorySupabase } from "./search-test-support.mjs";

const profile = { user_id: "test", city: "Lyon", guest_count: 100, budget_max: 25000 };
const input = { userId: "test", category: "venue", query: "lieu réception mariage Lyon piscine", location: "Lyon", profile };
const result = { url: "https://domaine-exemple.fr/", title: "Domaine Exemple, réception et mariage à Lyon", description: "Un domaine pour votre mariage à Lyon." };
const extracted = { type_de_page: "site_prestataire", hors_perimetre: false, couvre_zone_recherchee: true, nom: "Domaine Exemple", categorie: "venue", adresse: "Lyon", zone_intervention: "Lyon", email: "contact@domaine-exemple.fr", site_web: result.url, description_detaillee: "Un domaine de réception à Lyon proposant des mariages dans ses jardins et ses salons.", references_mariage: "Nous accueillons votre mariage à Lyon.", points_forts: ["Jardin"], photos: [] };
const response = data => Response.json(data);
const googleResponse = (data = extracted, finishReason = "STOP") => response({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(data) }] } }] });
const keys = { googleApiKey: "test-google", googleModel: "test-model", mistralApiKey: "test-mistral", mistralExtractionModel: "test-extractor", firecrawlApiKeys: ["test-firecrawl"] };

function setup({ results = [result], scrape, search, fetcher, env = {} } = {}) {
  const calls = { search: [], scrape: [], fetch: [] };
  class Firecrawl {
    constructor(options) { assert.ok(options.maxRetries >= 1, "SDK must make at least one attempt"); }
    async search(query) { calls.search.push(query); return search ? search(query) : { web: results }; }
    async scrape(url) { calls.scrape.push(url); return scrape ? scrape(url) : { markdown: `${result.title}\n${extracted.description_detaillee}` }; }
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.fetch.push({ url, body: JSON.parse(options.body), signal: options.signal });
    return fetcher ? fetcher(url, options) : googleResponse();
  };
  const load = createServerModuleLoader({ mocks: {
    "@mendable/firecrawl-js": Firecrawl,
    "@/lib/env": { env: { ...keys, ...env }, validateServerEnv() {}, validateChatAiEnv() {} }
  } });
  return { calls, load, restore: () => { globalThis.fetch = originalFetch; } };
}

test("Google extracts verified profiles even when Mistral is unavailable", async t => {
  const s = setup({ fetcher: url => url.includes("googleapis") ? googleResponse() : new Response("", { status: 429 }) });
  t.after(s.restore);
  const results = await s.load("lib/server/firecrawl.ts").searchVendorsWithFirecrawl(createMemorySupabase(profile), input);
  assert.equal(results.length, 1);
  assert.equal(results[0].name, extracted.nom);
  assert.ok(s.calls.fetch.every(c => c.url.includes("googleapis")));
});

test("Mistral remains a working fallback when Google returns 429", async t => {
  const s = setup({ fetcher: url => url.includes("googleapis") ? new Response("", { status: 429 }) : response({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(extracted) } }] }) });
  t.after(s.restore);
  assert.equal((await s.load("lib/server/firecrawl.ts").searchVendorsWithFirecrawl(createMemorySupabase(profile), input)).length, 1);
  assert.equal(s.calls.fetch.length, 2);
});

test("truncated extraction is rejected and uses the backup provider", async t => {
  const s = setup({ fetcher: url => url.includes("googleapis") ? googleResponse(extracted, "MAX_TOKENS") : response({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(extracted) } }] }) });
  t.after(s.restore);
  assert.equal((await s.load("lib/server/firecrawl.ts").searchVendorsWithFirecrawl(createMemorySupabase(profile), input)).length, 1);
  assert.equal(s.calls.fetch.length, 2);
});

test("directories and duplicate domains are filtered before scraping", async t => {
  const s = setup({ results: [
    { ...result, url: "https://mariages.net/lieu/lyon" },
    { ...result, url: "https://annuaire.fr/prestataires/lyon" },
    result, { ...result, url: result.url + "mariage" }
  ] });
  t.after(s.restore);
  assert.equal((await s.load("lib/server/firecrawl.ts").searchVendorsWithFirecrawl(createMemorySupabase(profile), input)).length, 1);
  assert.deepEqual(s.calls.scrape, [result.url]);
});

for (const [name, override] of [
  ["a scraped directory", { type_de_page: "annuaire_ou_liste" }],
  ["an unverified page type", { type_de_page: null }],
  ["a provider outside the requested area", { couvre_zone_recherchee: false }],
  ["a provider that does not handle weddings", { hors_perimetre: true }]
]) test(`quality gate rejects ${name}`, async t => {
  const s = setup({ fetcher: () => googleResponse({ ...extracted, ...override }) });
  t.after(s.restore);
  assert.equal((await s.load("lib/server/firecrawl.ts").searchVendorsWithFirecrawl(createMemorySupabase(profile), input)).length, 0);
});

test("deadline preserves completed candidates and prevents late extractions", async t => {
  const s = setup({ results: [result, { ...result, url: "https://domaine-lent.fr/" }], scrape: async url => {
    if (url.includes("lent")) await new Promise(r => setTimeout(r, 100));
    return { markdown: extracted.description_detaillee };
  } });
  t.after(s.restore);
  const results = await s.load("lib/server/firecrawl.ts").searchVendorsWithFirecrawl(createMemorySupabase(profile), { ...input, timeBudgetMs: 40 });
  assert.equal(results.length, 1);
  await new Promise(r => setTimeout(r, 110));
  assert.equal(s.calls.fetch.length, 1, "An expired pass must not launch another extraction");
});

test("expanded search removes optional constraints while keeping category and city", async t => {
  const s = setup(); t.after(s.restore);
  await s.load("lib/server/firecrawl.ts").searchVendorsWithFirecrawl(createMemorySupabase(profile), { ...input, mode: "expanded" });
  assert.match(s.calls.search[0], /mariage Lyon/);
  assert.doesNotMatch(s.calls.search[0], /piscine/);
});

test("confirmation and extra details preserve the pending search brief during AI outages", () => {
  const { heuristicClassificationV2, normalizeSearchBrief } = createServerModuleLoader()("lib/server/chat-v2/contracts.ts");
  const pending = { brief: normalizeSearchBrief({ category: "photographer", location: "Paris" }), turns: 0 };
  for (const text of ["oui vas-y", "plutôt naturel"]) {
    const decision = heuristicClassificationV2(text, pending, null);
    assert.equal(decision.vendorSearch.category, "photographer");
    assert.equal(decision.vendorSearch.location, "Paris");
  }
});

test("chat config accepts either provider independently", () => {
  const original = { google: process.env.GOOGLE_API_KEY, mistral: process.env.MISTRAL_API_KEY };
  try {
    const { validateChatAiEnv } = createServerModuleLoader()("lib/env.ts");
    for (const provider of ["GOOGLE_API_KEY", "MISTRAL_API_KEY"]) {
      delete process.env.GOOGLE_API_KEY; delete process.env.MISTRAL_API_KEY;
      process.env[provider] = "test";
      assert.doesNotThrow(validateChatAiEnv);
    }
    delete process.env.GOOGLE_API_KEY; delete process.env.MISTRAL_API_KEY;
    assert.throws(validateChatAiEnv, /GOOGLE_API_KEY or MISTRAL_API_KEY/);
  } finally {
    for (const [key, value] of [["GOOGLE_API_KEY", original.google], ["MISTRAL_API_KEY", original.mistral]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("complete POST route saves verified profiles and returns the results CTA despite Mistral 429", async t => {
  const s = setup(); t.after(s.restore);
  const db = createMemorySupabase(profile);
  const firecrawl = s.load("lib/server/firecrawl.ts");
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url.includes("mistral.ai")) return new Response("", { status: 429 });
    const body = JSON.parse(options.body);
    if (body.generationConfig.maxOutputTokens === 700) return googleResponse({ intent: "search_request", confidence: 1, reply: "", search: { category: "venue", location: "Lyon", guest_count: 100 } });
    if (body.generationConfig.maxOutputTokens === 190) return googleResponse("Vos fiches sont prêtes à consulter ci-dessous.");
    return previousFetch(url, options);
  };
  const load = createServerModuleLoader({ mocks: {
    "@/lib/env": { env: keys, validateServerEnv() {}, validateChatAiEnv() {} },
    "@/lib/server/firecrawl": firecrawl,
    "@/lib/supabase/auth": { getAuthenticatedUser: async () => ({ user: { id: "test" } }) },
    "@/lib/supabase/server": { createSupabaseServerClient: () => db }
  } });
  const res = await load("app/api/chat-v2/route.ts").POST(new NextRequest("http://localhost/api/chat-v2", {
    method: "POST", body: JSON.stringify({ content: "Cherche-moi un lieu de mariage à Lyon pour 100 invités." })
  }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(db.tables.vendor_candidates.length, 1);
  assert.equal(db.tables.vendor_requests[0].status, "results_ready");
  assert.ok(body.assistantMessage.ctaHref);
  assert.match(body.assistantMessage.content, /tarifs et les disponibilités restent à confirmer/);
  assert.equal(db.tables.vendor_candidates[0].metadata_json.normalizer_error, true);
  const listingResponse = await load("app/api/vendors/route.ts").GET(new NextRequest("http://localhost/api/vendors?category=venue"));
  const listing = await listingResponse.json();
  assert.equal(listingResponse.status, 200);
  assert.equal(listing.candidates.length, 1, "Saved profiles must be visible in the results page API");
  assert.equal(listing.candidates[0].name, extracted.nom);
});

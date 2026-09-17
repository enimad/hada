import { loadEnvLocal } from "./lib-loader.mjs";
import { createServerModuleLoader } from "./server-module-loader.mjs";
import { createMemorySupabase } from "./search-test-support.mjs";
import { NextRequest } from "next/server.js";
import assert from "node:assert/strict";

loadEnvLocal();
const load = createServerModuleLoader({ exports: {
  "app/api/chat-v2/route.ts": ["classifyTurnV2", "buildGoogleGenerateContentBody"],
  "lib/server/hada.ts": ["hasUsableNormalizedProfile"]
} });
const { env } = load("lib/env.ts");
const profile = { city: "Paris", region: "Île-de-France", country: "France", guest_count: 100, budget_max: 25000, style: "naturel" };
console.log(JSON.stringify({ googleModel: env.googleModel, googleConfigured: !!env.googleApiKey, mistralConfigured: !!env.mistralApiKey, firecrawlKeyCount: env.firecrawlApiKeys.length }));

if (process.argv.includes("--providers")) {
  const route = load("app/api/chat-v2/route.ts");
  for (const userText of ["Cherche-moi un photographe de mariage à Paris au style naturel.", "Comment choisir un photographe de mariage ?"]) {
    const start = Date.now();
    const result = await route.classifyTurnV2({ userText, messages: [], profile, pendingSearch: null, pendingProposal: null });
    console.log(JSON.stringify({ stage: "intent", userText, elapsedMs: Date.now() - start, result }));
  }
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.mistralApiKey}` },
    body: JSON.stringify({ model: env.mistralExtractionModel, messages: [{ role: "user", content: "Réponds seulement OK." }], max_tokens: 50 }),
    signal: AbortSignal.timeout(15000)
  });
  console.log(JSON.stringify({ stage: "mistral_extraction_health", status: response.status }));
}

if (process.argv.includes("--end-to-end")) {
  for (const scenario of [
    { category: "venue", city: "Lyon", message: "Cherche-moi des lieux de réception pour mon mariage à Lyon, 100 invités, budget du lieu 6000 euros." },
    { category: "photographer", city: "Paris", message: "Cherche-moi un photographe de mariage à Paris au style naturel, budget 2500 euros." }
  ]) {
    const db = createMemorySupabase({ ...profile, city: scenario.city, region: null, user_id: "diagnostic" });
    const routeLoad = createServerModuleLoader({ mocks: {
      "@/lib/supabase/auth": { getAuthenticatedUser: async () => ({ user: { id: "diagnostic" } }) },
      "@/lib/supabase/server": { createSupabaseServerClient: () => db }
    } });
    const started = Date.now();
    const response = await routeLoad("app/api/chat-v2/route.ts").POST(new NextRequest("http://localhost/api/chat-v2", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: scenario.message })
    }));
    const body = await response.json();
    const candidates = db.tables.vendor_candidates;
    const result = { stage: "route_end_to_end", category: scenario.category, status: response.status, elapsedMs: Date.now() - started, count: candidates.length,
      requestStates: db.tables.vendor_requests.map(r => r.status), assistant: body.assistantMessage,
      candidates: candidates.map(c => ({ name: c.name, url: c.source_url, category: c.category, summary: c.summary, city: c.city, score: c.score, fallback: c.metadata_json.normalizer_error })) };
    console.log(JSON.stringify(result));
    assert.equal(response.status, 200);
    assert.ok(candidates.length > 0, "No verified candidates saved");
    assert.ok(candidates.every(c => c.category === scenario.category));
    assert.ok(candidates.every(c => c.source_url?.startsWith("https://") && c.summary?.length >= 45));
    assert.ok(db.tables.vendor_requests.every(r => r.status === "results_ready"));
    assert.ok(body.assistantMessage?.ctaHref, "Missing results link");
    assert.ok(result.elapsedMs < 120000, "Route exceeded production duration");
    const listingResponse = await routeLoad("app/api/vendors/route.ts").GET(new NextRequest(`http://localhost/api/vendors?category=${scenario.category}`));
    const listing = await listingResponse.json();
    assert.equal(listingResponse.status, 200);
    assert.equal(listing.candidates.length, candidates.length, "Saved profiles must also pass the display filters");
    console.log(JSON.stringify({ stage: "vendor_listing", category: scenario.category, displayed: listing.candidates.length }));
  }
}

if (process.argv.includes("--firecrawl")) {
  // No database writes or real user data: only the external search/extraction APIs are live.
  const supabase = { from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) };
  const start = Date.now();
  const results = await load("lib/server/firecrawl.ts").searchVendorsWithFirecrawl(supabase, {
    userId: "diagnostic", category: "photographer", query: "photographe mariage Paris naturel", location: "Paris", profile
  });
  console.log(JSON.stringify({ stage: "firecrawl_results", elapsedMs: Date.now() - start, count: results.length, results: results.map(r => ({ name: r.name, url: r.sourceUrl, category: r.category, score: r.score, city: r.city, summary: r.summary })) }));
  if (!results.length) process.exitCode = 1;
  for (const candidate of results) {
    const normalized = await load("lib/server/vendor-profile-normalizer.ts").normalizeVendorProfileWithMistral({ candidate, profile, search: { category: "photographer", location: "Paris", searchQuery: "photographe mariage Paris naturel", style: "naturel", constraints: null, budget: null } });
    const usable = load("lib/server/hada.ts").hasUsableNormalizedProfile(candidate, normalized.vendorProfile, normalized.usedFallback);
    console.log(JSON.stringify({ stage: "normalized_profile", name: candidate.name, elapsedMs: Date.now() - start, usable, usedFallback: normalized.usedFallback, error: normalized.error }));
    if (!usable) process.exitCode = 1;
  }
}

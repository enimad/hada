/**
 * Évaluation LIVE du routeur d'intention Chat V2 contre l'API Mistral réelle.
 *
 * Usage : npm run eval:intent
 * - lit MISTRAL_API_KEY / MISTRAL_MODEL dans .env.local ;
 * - envoie le vrai prompt de décision (buildHadaTurnPrompt) en JSON mode
 *   sur chaque cas de CHAT_V2_LLM_EVAL_CASES ;
 * - applique la même porte d'exécution que la prod (applyExecutionGate) ;
 * - affiche précision globale et matrice de confusion.
 *
 * Coût : ~25 appels au modèle configuré (quelques centimes).
 */
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

loadEnvLocal(path.join(root, ".env.local"));

const apiKey = process.env.MISTRAL_API_KEY;
const model = process.env.MISTRAL_MODEL || "mistral-medium-latest";
if (!apiKey) {
  console.error("MISTRAL_API_KEY introuvable (dans .env.local ou l'environnement).");
  process.exit(1);
}

const contracts = loadContractsModule();
const {
  CHAT_V2_LLM_EVAL_CASES,
  buildHadaTurnPrompt,
  parseHadaDecisionResponse,
  decisionToIntentClassification,
  applyExecutionGate,
  heuristicClassificationV2
} = contracts;

const cases = CHAT_V2_LLM_EVAL_CASES;
console.log(`Évaluation du routeur d'intention sur ${cases.length} cas (modèle : ${model})...\n`);

const confusion = new Map();
let passed = 0;
let parseFailures = 0;
let evaluated = 0;
const rateLimitedCases = [];

for (const testCase of cases) {
  const outcome = await evaluateCase(testCase);
  if (outcome === "rate_limited") rateLimitedCases.push(testCase);
}

// Seconde passe pour les cas victimes du rate limit, après une vraie pause.
if (rateLimitedCases.length > 0) {
  console.log(`\nSeconde passe pour ${rateLimitedCases.length} cas rate-limités (pause de 30 s)...`);
  await sleep(30000);
  for (const testCase of rateLimitedCases) {
    await sleep(5000);
    const outcome = await evaluateCase(testCase, "retry");
    if (outcome === "rate_limited") {
      console.error(`  ${testCase.name}: toujours rate-limité, exclu de la précision.`);
    }
  }
}

async function evaluateCase(testCase, label = "") {
  const messages = (testCase.history ?? []).map((message, index) => ({
    id: String(index),
    role: message.role,
    content: message.content
  }));
  messages.push({ id: "last", role: "user", content: testCase.userText });

  const systemPrompt = buildHadaTurnPrompt({
    profileSummary: testCase.profileSummary ?? "Mariage prévu à Paris, 100 invités, budget 30 000 EUR.",
    messages,
    pendingSearch: testCase.pendingSearch,
    pendingProposal: testCase.pendingProposal
  });

  const raw = await callMistral(systemPrompt, testCase.userText);
  if (raw === "RATE_LIMITED") return "rate_limited";
  const decision = parseHadaDecisionResponse(raw);

  // Même pipeline que la prod : décision LLM, sinon fallback heuristique.
  if (!decision) {
    parseFailures += 1;
    console.error(`  (décision LLM inexploitable, bascule heuristique : ${JSON.stringify((raw ?? "").slice(0, 120))})`);
  }
  const classification = applyExecutionGate(
    decision
      ? decisionToIntentClassification(decision, {
          userText: testCase.userText,
          pendingSearch: testCase.pendingSearch,
          pendingProposal: testCase.pendingProposal
        })
      : heuristicClassificationV2(testCase.userText, testCase.pendingSearch, testCase.pendingProposal),
    {
      userText: testCase.userText,
      pendingSearch: testCase.pendingSearch,
      pendingProposal: testCase.pendingProposal
    }
  );

  const actualIntent = classification.intent;
  const intentOk = testCase.expectedIntents.includes(actualIntent);
  const proposeOk =
    testCase.expectedProposeSearch === undefined || classification?.proposeSearch === testCase.expectedProposeSearch;
  const ok = intentOk && proposeOk;
  evaluated += 1;
  if (ok) passed += 1;

  const key = `${testCase.expectedIntents.join("|")} -> ${actualIntent}${classification?.proposeSearch ? " (+propose)" : ""}`;
  confusion.set(key, (confusion.get(key) ?? 0) + 1);

  console.log(
    `${ok ? "PASS" : "FAIL"} ${testCase.name}: ${actualIntent}${classification?.proposeSearch ? " (+propose_search)" : ""}` +
      (ok ? "" : ` — attendu ${testCase.expectedIntents.join(" ou ")}${testCase.expectedProposeSearch !== undefined ? ` (propose_search=${testCase.expectedProposeSearch})` : ""}`)
  );

  // Espacement des appels pour respecter le rate limit Mistral.
  await sleep(1500);
  return "done";
}

const skipped = cases.length - evaluated;
const accuracy = evaluated > 0 ? Math.round((passed / evaluated) * 100) : 0;
console.log(`\nPrécision : ${passed}/${evaluated} (${accuracy}%)${skipped > 0 ? ` — ${skipped} cas non évalués (rate limit persistant)` : ""}`);
if (parseFailures > 0) console.log(`Réponses JSON illisibles : ${parseFailures}`);
console.log("\nMatrice attendu -> obtenu :");
for (const [key, count] of [...confusion.entries()].sort()) {
  console.log(`  ${count}x ${key}`);
}

if (accuracy < 90) {
  console.error("\nObjectif de précision non atteint (< 90%).");
  process.exit(1);
}
console.log("\nObjectif de précision atteint (>= 90%).");

async function callMistral(systemPrompt, userText) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 700,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userText }
          ]
        })
      });

      if (response.status === 429) {
        await sleep(2500 * (attempt + 1));
        continue;
      }
      if (!response.ok) {
        console.error(`  (HTTP ${response.status} Mistral)`);
        return null;
      }

      const result = await response.json();
      return result?.choices?.[0]?.message?.content?.trim() || null;
    } catch (error) {
      console.error(`  (erreur réseau : ${error.message})`);
      await sleep(1500);
    }
  }
  console.error("  (rate limit Mistral persistant, cas abandonné)");
  return "RATE_LIMITED";
}

function loadContractsModule() {
  const contractsPath = path.join(root, "lib", "server", "chat-v2", "contracts.ts");
  const source = fs.readFileSync(contractsPath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    },
    fileName: contractsPath
  }).outputText;

  const contractsModule = new Module(contractsPath);
  contractsModule.filename = contractsPath;
  contractsModule.paths = Module._nodeModulePaths(path.dirname(contractsPath));
  contractsModule._compile(compiled, contractsPath);
  return contractsModule.exports;
}

function loadEnvLocal(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

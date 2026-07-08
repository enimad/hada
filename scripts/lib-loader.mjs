/**
 * Charge lib/directory-page-detector.ts (et sa dépendance blocked-vendor-sources.ts)
 * dans un script Node sans build : les deux sources sont concaténées (l'import
 * aliasé "@/lib/blocked-vendor-sources" est retiré) puis transpilées en CommonJS.
 * Même famille de pattern que scripts/test-intent-router.mjs.
 */
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

export function loadDirectoryDetector() {
  const blockedPath = path.join(root, "lib", "blocked-vendor-sources.ts");
  const detectorPath = path.join(root, "lib", "directory-page-detector.ts");

  const blockedSource = fs.readFileSync(blockedPath, "utf8");
  const detectorSource = fs
    .readFileSync(detectorPath, "utf8")
    .replace(/^import\s+\{[^}]+\}\s+from\s+"@\/lib\/blocked-vendor-sources";\s*$/m, "");

  const combined = `${blockedSource}\n${detectorSource}`;
  const compiled = ts.transpileModule(combined, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    },
    fileName: detectorPath
  }).outputText;

  const loaded = new Module(detectorPath);
  loaded.filename = detectorPath;
  loaded.paths = Module._nodeModulePaths(path.dirname(detectorPath));
  loaded._compile(compiled, detectorPath);

  if (typeof loaded.exports.looksLikeDirectoryPage !== "function") {
    throw new Error("lib-loader: looksLikeDirectoryPage est introuvable après transpilation.");
  }

  return loaded.exports;
}

export function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

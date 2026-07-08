import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
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

const testModule = new Module(contractsPath);
testModule.filename = contractsPath;
testModule.paths = Module._nodeModulePaths(path.dirname(contractsPath));
testModule._compile(compiled, contractsPath);

const { evaluateChatV2GuardTestCases } = testModule.exports;

if (typeof evaluateChatV2GuardTestCases !== "function") {
  console.error("Intent test runner: evaluateChatV2GuardTestCases export is missing.");
  process.exit(1);
}

const results = evaluateChatV2GuardTestCases();
const failures = results.filter((result) => !result.passed);

for (const result of results) {
  const status = result.passed ? "PASS" : "FAIL";
  console.log(`${status} ${result.name}: ${result.actualIntent}${result.proposeSearch ? " (+propose_search)" : ""}`);
}

if (failures.length > 0) {
  console.error("\nIntent guard failures:");
  for (const failure of failures) {
    console.error(`- ${failure.name}: expected ${failure.expectedIntent}, got ${failure.actualIntent}`);
  }
  process.exit(1);
}

console.log(`\nIntent guard tests passed (${results.length} cases).`);

import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = fileURLToPath(new URL("..", import.meta.url));

// Execute the actual server code in diagnostics/tests, with isolated dependencies.
export function createServerModuleLoader({ mocks = {}, exports = {} } = {}) {
  const cache = new Map();
  function load(relativePath) {
    const filename = path.resolve(root, relativePath);
    if (cache.has(filename)) return cache.get(filename).exports;
    const source = fs.readFileSync(filename, "utf8");
    const extra = exports[relativePath] ?? [];
    const compiled = ts.transpileModule(source + (extra.length ? `\nexport { ${extra.join(", ")} };` : ""), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename
    }).outputText;
    const loaded = new Module(filename);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    const nativeRequire = loaded.require.bind(loaded);
    loaded.require = (specifier) => {
      if (specifier in mocks) return mocks[specifier];
      if (specifier.startsWith("@/")) return load(`${specifier.slice(2)}.ts`);
      return nativeRequire(specifier);
    };
    cache.set(filename, loaded);
    loaded._compile(compiled, filename);
    return loaded.exports;
  }
  return load;
}

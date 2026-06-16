import { startServer } from "next/dist/server/lib/start-server.js";
import { access, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

process.env.NODE_ENV = "development";
process.env.NEXT_TELEMETRY_DISABLED ??= "1";

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "localhost";

const nextDir = join(process.cwd(), ".next");
const devLayoutCss = join(nextDir, "static", "css", "app", "layout.css");
const requiredDevArtifacts = [
  join(nextDir, "routes-manifest.json"),
  join(nextDir, "server", "app-paths-manifest.json"),
  join(nextDir, "server", "pages-manifest.json")
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function cleanNextDir() {
  await rm(nextDir, { recursive: true, force: true });
}

// A previous `next build` can leave production assets in `.next` while the dev
// server expects development asset paths. Clean only that stale state, not every
// dev start, so localhost keeps fast incremental rebuilds.
try {
  const hasNextDir = await exists(nextDir);
  const hasAllRequiredArtifacts = (await Promise.all(requiredDevArtifacts.map((artifact) => exists(artifact)))).every(Boolean);

  if (hasNextDir && !hasAllRequiredArtifacts) {
    await cleanNextDir();
  } else if (!(await exists(devLayoutCss))) {
    const cssDir = join(nextDir, "static", "css");
    const cssFiles = await readdir(cssDir);
    if (cssFiles.some((file) => file.endsWith(".css"))) {
      await cleanNextDir();
    }
  }
} catch {
  try {
    await cleanNextDir();
  } catch {}
}

await startServer({
  dir: process.cwd(),
  isDev: true,
  hostname,
  port,
  allowRetry: false,
});

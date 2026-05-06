import { startServer } from "next/dist/server/lib/start-server.js";

process.env.NODE_ENV = "development";
process.env.NEXT_TELEMETRY_DISABLED ??= "1";

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "localhost";

await startServer({
  dir: process.cwd(),
  isDev: true,
  hostname,
  port,
  allowRetry: false,
});

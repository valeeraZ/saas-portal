import next from "next";
import { createServer } from "node:https";
import { readFileSync, writeFileSync } from "node:fs";
const app = next({ dev: false, hostname: "127.0.0.1", port: 58999 });
await app.prepare();
writeFileSync(".local/portal.pid", String(process.pid));
createServer(
  {
    key: readFileSync(".local/auth-config/.local/tls.key"),
    cert: readFileSync(".local/auth-config/.local/tls.crt"),
  },
  app.getRequestHandler(),
).listen(58999, "127.0.0.1", () =>
  console.log("Portal HTTPS ready on 127.0.0.1:58999"),
);

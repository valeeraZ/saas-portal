import next from "next";
import { createServer as httpServer, type RequestListener } from "node:http";
import { createServer as httpsServer } from "node:https";
import { readFileSync } from "node:fs";
import { protectAppResponse } from "./lib/app-response.ts";
const port = Number(process.env.PORT ?? 58999);
const hostname = process.env.PORTAL_BIND_HOST ?? "127.0.0.1";
const app = next({ dev: process.argv.includes("--dev"), hostname, port });
await app.prepare();
const handle = app.getRequestHandler();
const listener: RequestListener = (req, res) => {
  protectAppResponse(req, res);
  void handle(req, res);
};
const server = process.env.PORTAL_TLS_KEY_FILE
  ? httpsServer(
      {
        key: readFileSync(process.env.PORTAL_TLS_KEY_FILE),
        cert: readFileSync(process.env.PORTAL_TLS_CERT_FILE!),
      },
      listener,
    )
  : httpServer(listener);
// Upgrade has a separate request lifecycle and is not part of the HTTP contract.
server.on("upgrade", (_req, socket) => {
  socket.end("HTTP/1.1 501 Not Implemented\r\nConnection: close\r\n\r\n");
});
server.listen(port, hostname, () =>
  console.log(`Portal ready on ${hostname}:${port}`),
);

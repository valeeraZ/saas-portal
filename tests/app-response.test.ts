import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { protectAppResponse } from "../lib/app-response.ts";
const tenant = "00000000-0000-4000-8000-000000000001";
const base = `/tenants/${tenant}/apps/reports`;
test("native response entry strips sensitive headers and confines HTTP and action redirects", async () => {
  process.env.PORTAL_ALLOWED_APP_ORIGINS = "https://reports.internal";
  const server = createServer((req, res) => {
    protectAppResponse(req, res);
    assert.equal(req.headers["x-saas-request"], undefined);
    // Simulate Next applying the authorized Proxy request override.
    req.headers["x-saas-request"] = "server-generated";
    req.headers.host = "reports.internal";
    const mode = new URL(req.url!, "http://portal").searchParams.get("mode");
    const location =
      mode === "external" ? "https://evil.test/" : "/reports/next?q=1";
    const headers = {
      "set-cookie": "__Host-portal-session=forged; Secure; Path=/",
      "x-internal": "secret",
      "content-type": "text/plain",
      vary: "RSC",
      "x-action-redirect": location + ";push",
    };
    res.writeHead(302, { ...headers, location });
    res.write("upstream-");
    res.end("body");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    for (const mode of ["internal", "external"]) {
      const response = await fetch(origin + base + "/form?mode=" + mode, {
        headers: { "x-saas-request": "forged" },
        redirect: "manual",
      });
      assert.equal(response.headers.get("set-cookie"), null);
      assert.equal(response.headers.get("x-internal"), null);
      assert.equal(response.headers.get("cache-control"), "no-store");
      if (mode === "internal") {
        assert.equal(response.status, 302);
        assert.equal(response.headers.get("location"), base + "/next?q=1");
        assert.equal(
          response.headers.get("x-action-redirect"),
          base + "/next?q=1;push",
        );
        assert.equal(await response.text(), "upstream-body");
      } else {
        assert.equal(response.status, 502);
        assert.equal(response.headers.get("location"), null);
        assert.equal(response.headers.get("x-action-redirect"), null);
        assert.equal(
          (await response.json()).error,
          "application_service_unavailable",
        );
      }
    }
  } finally {
    server.close();
  }
});

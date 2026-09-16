/** Real tenant-scoped example backend. Only the public Portal verification key is available here. */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { importSPKI, jwtVerify } from "jose";
import { Pool } from "pg";
const publicKey = await importSPKI(
  readFileSync(process.env.EXAMPLE_PUBLIC_KEY_FILE!, "utf8"),
  "RS256",
);
const pool = new Pool({ connectionString: process.env.EXAMPLE_DATABASE_URL });
await pool.query(
  `CREATE TABLE IF NOT EXISTS notes(tenant_id uuid NOT NULL,id bigint GENERATED ALWAYS AS IDENTITY,body text NOT NULL CHECK(length(body)<=200),PRIMARY KEY(tenant_id,id)); CREATE TABLE IF NOT EXISTS requests(id uuid PRIMARY KEY,expires_at timestamptz NOT NULL)`,
);
const appId = process.env.EXAMPLE_APP_ID!,
  issuer = process.env.EXAMPLE_ISSUER!;
const server = createServer(async (req, res) => {
  const send = (status: number, body: string, type = "application/json") => {
    res.writeHead(status, { "content-type": type });
    res.end(body);
  };
  try {
    const token = req.headers["x-saas-request"];
    if (typeof token !== "string")
      return send(401, '{"error":"missing_assertion"}');
    const { payload: p } = await jwtVerify(token, publicKey, {
      algorithms: ["RS256"],
      issuer,
      audience: appId,
      requiredClaims: ["sub", "jti", "iat", "exp"],
      maxTokenAge: "30s",
    });
    if (
      p.method !== req.method ||
      p.path !== req.url ||
      typeof p.tenantId !== "string" ||
      !/^[a-f0-9-]{36}$/.test(p.tenantId) ||
      typeof p.basePath !== "string" ||
      p.basePath !== `/tenants/${p.tenantId}/apps/reports` ||
      !Array.isArray(p.roles) ||
      !p.roles.includes("viewer")
    )
      return send(403, '{"error":"wrong_context"}');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8388608) return send(413, "{}");
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    if (createHash("sha256").update(body).digest("hex") !== p.bodyHash)
      return send(403, '{"error":"body_mismatch"}');
    // A separate database prevents replay across backend replicas. All business SQL scopes by tenant.
    await pool.query("DELETE FROM requests WHERE expires_at<now()");
    const accepted = await pool.query(
      "INSERT INTO requests(id,expires_at) VALUES($1,to_timestamp($2)) ON CONFLICT DO NOTHING RETURNING id",
      [p.jti, p.exp],
    );
    if (!accepted.rowCount) return send(401, '{"error":"replay"}');
    if (
      req.headers.cookie ||
      req.headers.authorization ||
      req.headers["x-portal-key"] ||
      (req.headers["x-forwarded-host"] &&
        req.headers["x-forwarded-host"] !== req.headers.host)
    )
      return send(400, '{"error":"unsafe_forwarding"}');
    const path = new URL(req.url!, "http://example").pathname;
    const base = p.basePath;
    if (path === "/reports/echo")
      return send(
        200,
        JSON.stringify({
          bytes: body.length,
          hash: createHash("sha256").update(body).digest("hex"),
          url: req.url,
          contentType: req.headers["content-type"],
          rsc: req.headers.rsc,
          action: req.headers["next-action"],
          state: req.headers["next-router-state-tree"],
        }),
      );

    if (path === "/reports/" || path === "/reports")
      return send(
        200,
        `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>租户报表</title><link rel="stylesheet" href="${base}/app.css"><link rel="icon" href="${base}/icon.svg"></head><body><main><h1>租户报表</h1><p id="tenant">${p.tenantId}</p><form><label>记录内容<input name="note" maxlength="200" required></label><button>保存记录</button></form><ul id="notes"></ul><p role="alert"></p><a href="/tenants/${p.tenantId}">返回租户</a></main><script src="${base}/app.js"></script></body></html>`,
        "text/html; charset=utf-8",
      );
    if (path === "/reports/app.js")
      return send(
        200,
        `const base=${JSON.stringify(base)};async function refresh(){const r=await fetch(base+'/api/notes');if(!r.ok)throw Error('无法读取记录');const data=await r.json();document.querySelector('#notes').replaceChildren(...data.map(n=>{const e=document.createElement('li');e.textContent=n.body;return e;}));}document.querySelector('form').onsubmit=async e=>{e.preventDefault();try{const r=await fetch(base+'/api/notes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body:e.target.note.value})});if(!r.ok)throw Error('无法保存记录');e.target.reset();await refresh();}catch(e){document.querySelector('[role=alert]').textContent=e.message;}};refresh().catch(e=>document.querySelector('[role=alert]').textContent=e.message);`,
        "text/javascript",
      );
    if (path === "/reports/app.css")
      return send(
        200,
        "body{font:16px system-ui;background:#f6f8fb;color:#172239}main{max-width:700px;margin:50px auto;padding:24px;background:white;border-radius:12px}form,label{display:grid;gap:12px}input,button{font:inherit;padding:12px}button{background:#2859d8;color:white;border:0;border-radius:6px}#tenant{overflow-wrap:anywhere}",
        "text/css",
      );
    if (path === "/reports/icon.svg")
      return send(
        200,
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="blue"/></svg>',
        "image/svg+xml",
      );
    if (path === "/reports/api/notes" && req.method === "GET")
      return send(
        200,
        JSON.stringify(
          (
            await pool.query(
              "SELECT body FROM notes WHERE tenant_id=$1 ORDER BY id",
              [p.tenantId],
            )
          ).rows,
        ),
      );
    if (path === "/reports/api/notes" && req.method === "POST") {
      const data = JSON.parse(body.toString());
      if (
        typeof data.body !== "string" ||
        !data.body.trim() ||
        data.body.length > 200
      )
        return send(400, "{}");
      await pool.query("INSERT INTO notes(tenant_id,body) VALUES($1,$2)", [
        p.tenantId,
        data.body,
      ]);
      return send(201, '{"saved":true}');
    }
    if (path === "/reports/redirect") {
      res.writeHead(302, {
        location: "/reports/",
        "set-cookie": "portal-session=evil; Path=/",
        "x-internal": "secret",
      });
      return res.end();
    }
    if (path === "/reports/external") {
      res.writeHead(302, {
        location: "http://169.254.169.254/latest/meta-data",
      });
      return res.end();
    }
    if (path === "/reports/events") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write("data: ready\n\n");
      return setTimeout(() => res.end("data: complete\n\n"), 20);
    }
    return send(404, "{}");
  } catch {
    return send(401, '{"error":"invalid_request"}');
  }
});
server.listen(59200, "127.0.0.1", () =>
  console.log("Tenant example backend ready"),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(() => {
      void pool.end();
    }),
  );

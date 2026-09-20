/** Real PostgreSQL + two Admin and production Portal replicas. Auth is a protocol stub.
 * Requires npm run build, ADMIN_SOURCE and REGISTRY_TEST_DATABASE_URL (disposable cluster).
 * Creates and drops only uniquely named databases owned by this test.
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import {
  randomBytes,
  randomUUID,
  generateKeyPairSync,
  createHash,
} from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { jwtVerify } from "jose";
const admin = resolve(process.env.ADMIN_SOURCE!);
const root = resolve(import.meta.dirname, "..");
const database = process.env.REGISTRY_TEST_DATABASE_URL;
if (!database) throw Error("Disposable REGISTRY_TEST_DATABASE_URL required");
const setup = new Pool({ connectionString: database });
const tag = randomBytes(6).toString("hex");
const databases = [
  "registry_admin_" + tag,
  "registry_portal_" + tag,
  "registry_app_" + tag,
];
const children: ChildProcess[] = [],
  servers: Server[] = [];
const local = mkdtempSync(join(tmpdir(), "runtime-registry-"));
let adminPool: Pool | undefined;
let closeStore: (() => Promise<void>) | undefined;
async function listen(server: Server) {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return "http://127.0.0.1:" + address.port;
}
async function freePort() {
  const s = createServer();
  s.listen(0, "127.0.0.1");
  await once(s, "listening");
  const a = s.address();
  assert.ok(a && typeof a !== "string");
  await new Promise<void>((r) => s.close(() => r()));
  return String(a.port);
}
async function start(cwd: string, env: NodeJS.ProcessEnv, ready: string) {
  const p = spawn(
    process.execPath,
    [cwd === admin ? "src/server.ts" : "server.ts"],
    { cwd, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  children.push(p);
  await new Promise<void>((ok, bad) => {
    let output = "";
    const timer = setTimeout(
      () => bad(Error("Startup timeout: " + output)),
      30000,
    );
    p.stdout!.on("data", (b) => {
      output += String(b);
      if (output.includes(ready)) {
        clearTimeout(timer);
        ok();
      }
    });
    p.stderr!.on("data", (b) => {
      output += String(b);
    });
    p.once("exit", () => {
      clearTimeout(timer);
      bad(Error("Child exited: " + output));
    });
  });
  return p;
}
async function stop(p: ChildProcess) {
  if (p.exitCode !== null || p.signalCode !== null) return;
  const done = once(p, "exit");
  p.kill("SIGTERM");
  await done;
}
try {
  for (const name of databases) await setup.query(`CREATE DATABASE "${name}"`);
  const dbURL = (name: string) => {
    const u = new URL(database);
    u.pathname = "/" + name;
    return u.href;
  };
  const user = randomUUID(),
    tenants = [randomUUID(), randomUUID()];
  let authDown = false,
    denyTenant = "";
  const auth = await listen(
    createServer(async (req, res) => {
      res.setHeader("content-type", "application/json");
      if (authDown) {
        res.writeHead(503);
        res.end("{}");
        return;
      }
      if (req.headers.authorization !== "Bearer integration-token") {
        res.writeHead(401);
        res.end("{}");
        return;
      }
      const parts = req.url!.split("/");
      if (req.url === "/v1/tenant-context") {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const tenant = JSON.parse(Buffer.concat(chunks).toString()).tenantId;
        if (!tenants.includes(tenant)) {
          res.writeHead(404);
          res.end("{}");
          return;
        }
        res.end(
          JSON.stringify({
            tenant: { id: tenant, status: "active" },
            membership: { tenantId: tenant, userId: user, status: "active" },
          }),
        );
      } else
        res.end(
          JSON.stringify({
            tenantId: parts[3],
            userId: user,
            appId: parts[5],
            allowed: parts[3] !== denyTenant,
            roles: parts[3] === denyTenant ? [] : ["viewer"],
          }),
        );
    }),
  );
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privatePath = join(local, "key.pem");
  writeFileSync(
    privatePath,
    keys.privateKey.export({ type: "pkcs8", format: "pem" }),
    { mode: 0o600 },
  );
  const appIds = new Map<string, string>();
  let portalIssuer = "";
  const upstream = await listen(
    createServer(async (req, res) => {
      const u = new URL(req.url!, "http://upstream");
      if (u.pathname.startsWith("/app-assets/")) {
        res.setHeader("content-type", "application/javascript");
        res.setHeader("set-cookie", "stolen=true");
        res.end("/* " + u.pathname + " */");
        return;
      }
      try {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = Buffer.concat(chunks);
        const mount = u.pathname.startsWith("/tenants/")
          ? u.pathname.split("/")[4]
          : u.pathname.split("/")[1];
        const { payload } = await jwtVerify(
          String(req.headers["x-saas-request"]),
          keys.publicKey,
          {
            issuer: portalIssuer,
            audience: appIds.get(mount),
            algorithms: ["RS256"],
          },
        );
        assert.equal(payload.path, req.url);
        assert.equal(payload.method, req.method);
        assert.equal(
          payload.bodyHash,
          createHash("sha256").update(body).digest("hex"),
        );
        assert.equal(
          payload.basePath,
          `/tenants/${payload.tenantId}/apps/${mount}`,
        );
        if (u.pathname.endsWith("/escape")) {
          res.writeHead(302, {
            location: "https://evil.test",
            "set-cookie": "stolen=true",
          });
          res.end();
          return;
        }
        if (u.pathname.endsWith("/redirect")) {
          const location = u.pathname.slice(0, -8) + "next?q=1";
          res.writeHead(302, {
            location,
            "x-action-redirect": location + ";push",
            "set-cookie": "stolen=true",
          });
          res.end();
          return;
        }
        res.setHeader("content-type", "application/json");
        res.setHeader("x-internal", "hidden");
        res.setHeader("set-cookie", "stolen=true");
        res.end(
          JSON.stringify({
            tenantId: payload.tenantId,
            deploymentId: payload.deploymentId,
            path: req.url,
            body: body.toString(),
          }),
        );
      } catch {
        res.writeHead(401);
        res.end("{}");
      }
    }),
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ADMIN_DATABASE_URL: dbURL(databases[0]),
    ADMIN_AUTH_URL: auth,
    ADMIN_ALLOW_LOCAL_HTTP: "true",
    ADMIN_PORTAL_KEY: randomBytes(32).toString("base64url"),
    ADMIN_ALLOWED_APP_ORIGINS: upstream,
  };
  Object.assign(process.env, env);
  const { apply, migrate, pool } = await import(
    pathToFileURL(join(admin, "src/db.ts")).href
  );
  adminPool = pool;
  await migrate();
  await migrate();
  const command = (body: unknown, key: string = randomUUID()) =>
    apply(body, key, "registry-integration");
  const admins = [];
  for (let i = 0; i < 2; i++) {
    const port = await freePort();
    const child = await start(
      admin,
      { ...env, PORT: port },
      "Admin catalog ready",
    );
    admins.push({ origin: "http://127.0.0.1:" + port, child, port });
  }
  const portalPorts = [await freePort(), await freePort()];
  const nextPorts = [await freePort(), await freePort(), await freePort()];
  const egress = [
    upstream,
    ...nextPorts.map((p) => "http://127.0.0.1:" + p),
  ].join(",");
  process.env.ADMIN_ALLOWED_APP_ORIGINS = egress;
  env.ADMIN_ALLOWED_APP_ORIGINS = egress;
  portalIssuer = "http://127.0.0.1:" + portalPorts[0];
  const portalEnv: NodeJS.ProcessEnv = {
    ...env,
    PORTAL_REGISTRY_MODE: "admin",
    PORTAL_APP_EGRESS_ORIGINS: egress,
    PORTAL_ALLOW_LOCAL_HTTP: "true",
    PORTAL_ORIGIN: portalIssuer,
    PORTAL_OIDC_ISSUER: auth,
    PORTAL_AUTH_URL: auth,
    PORTAL_OIDC_CLIENT_ID: "integration",
    PORTAL_OIDC_CLIENT_SECRET: "unused-stub",
    PORTAL_ADMIN_KEY: env.ADMIN_PORTAL_KEY,
    PORTAL_DATABASE_URL: dbURL(databases[1]),
    PORTAL_SESSION_KEY: randomBytes(32).toString("base64"),
    PORTAL_APP_SIGNING_KEY_FILE: privatePath,
  };
  for (const key of [
    "PORTAL_ALLOWED_APP_ORIGINS",
    "PORTAL_NEXT_APP_ORIGINS",
    "PORTAL_APP_ASSETS",
    "PORTAL_TLS_KEY_FILE",
    "PORTAL_TLS_CERT_FILE",
  ])
    delete portalEnv[key];
  Object.assign(process.env, portalEnv);
  const store = await import("../lib/store.ts");
  closeStore = store.close;
  await store.migrate();
  const cookie =
    "portal-session=" +
    (await store.put(
      "session",
      {
        accessToken: "integration-token",
        idToken: "unused",
        csrf: "test",
        tokenExpires: Date.now() + 3600000,
      },
      3600,
    ));
  const portals: string[] = [];
  for (let i = 0; i < 2; i++) {
    await start(
      root,
      {
        ...portalEnv,
        PORT: portalPorts[i],
        PORTAL_ADMIN_URL: admins[i].origin,
      },
      "Portal ready",
    );
    portals.push("http://127.0.0.1:" + portalPorts[i]);
  }
  const request = (origin: string, path: string, extra: RequestInit = {}) =>
    fetch(origin + path, {
      ...extra,
      headers: { cookie, ...extra.headers },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
  const path = (tenant: string, mount: string, end = "echo?q=one&q=two") =>
    `/tenants/${tenant}/apps/${mount}/${end}`;
  const asset = (mount: string, version: string) =>
    `/app-assets/${mount}/${version}/_next/static/chunks/test.js`;
  async function register(
    mount: string,
    runtime: "http" | "nextjs",
    version: string | null,
    appId = randomUUID(),
  ) {
    await command({
      kind: "app",
      id: appId,
      name: mount,
      description: "",
      suffix: "/" + mount,
      active: true,
    });
    appIds.set(mount, appId);
    const dep = {
      kind: "runtime-deployment",
      id: randomUUID(),
      appId,
      digest: "sha256:" + randomBytes(32).toString("hex"),
      targetOrigin: upstream,
      runtime,
      assetVersion: version,
    };
    const key = randomUUID();
    await Promise.all([command(dep, key), command(dep, key)]);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*) FROM catalog_operations WHERE key=$1",
          [key],
        )
      ).rows[0].count,
      "1",
    );
    await assert.rejects(
      command({
        ...dep,
        runtime: "http",
        assetVersion: "invalid",
        id: randomUUID(),
        digest: "sha256:" + randomBytes(32).toString("hex"),
      }),
    );
    const failedKey = randomUUID();
    await assert.rejects(
      command(
        {
          kind: "installation",
          tenantId: tenants[0],
          appId,
          deploymentId: dep.id,
          enabled: true,
          entitled: true,
          validUntil: "2099-01-01T00:00:00Z",
        },
        failedKey,
      ),
    );
    assert.equal(
      (
        await pool.query("SELECT 1 FROM catalog_operations WHERE key=$1", [
          failedKey,
        ])
      ).rowCount,
      0,
    );
    if (runtime === "nextjs")
      assert.notEqual(
        (await request(portals[0], asset(mount, version!))).status,
        200,
      );
    await assert.rejects(
      command({
        ...dep,
        targetOrigin: "http://169.254.169.254",
        id: randomUUID(),
        digest: "sha256:" + randomBytes(32).toString("hex"),
      }),
    );
    await command({
      kind: "deployment-status",
      deploymentId: dep.id,
      status: "ready",
    });
    return dep;
  }
  const http = await register("reports", "http", null);
  const next = await register("notes", "nextjs", "v1");
  for (const dep of [http, next])
    for (const tenantId of tenants)
      await command({
        kind: "installation",
        tenantId,
        appId: dep.appId,
        deploymentId: dep.id,
        enabled: true,
        entitled: true,
        validUntil: "2099-01-01T00:00:00Z",
      });
  for (const origin of portals)
    for (const tenant of tenants)
      for (const [mount, dep] of [
        ["reports", http],
        ["notes", next],
      ] as const) {
        const r = await request(origin, path(tenant, mount), {
          headers: {
            "x-saas-request": "forged",
            "x-saas-route-origin": "https://evil.test",
            "x-saas-route-runtime": "http",
          },
        });
        assert.equal(r.status, 200, await r.clone().text());
        const data = await r.json();
        assert.equal(data.tenantId, tenant);
        assert.equal(data.deploymentId, dep.id);
        assert.equal(
          data.path,
          mount === "reports"
            ? "/reports/echo?q=one&q=two"
            : path(tenant, mount),
        );
        assert.equal(r.headers.get("set-cookie"), null);
        assert.equal(r.headers.get("x-internal"), null);
        const redirect = await request(origin, path(tenant, mount, "redirect"));
        assert.equal(redirect.status, 302);
        assert.equal(
          redirect.headers.get("location"),
          path(tenant, mount, "next?q=1"),
        );
        assert.equal(
          redirect.headers.get("x-action-redirect"),
          path(tenant, mount, "next?q=1") + ";push",
        );
        assert.equal(
          (await request(origin, path(tenant, mount, "escape"))).status,
          502,
        );
      }
  console.log(
    "PASS live onboarding after Portal startup, two replicas, two tenants, HTTP/Next path contracts, signed assertions and response boundaries",
  );
  assert.equal((await fetch(upstream + "/reports/echo")).status, 401);
  const post = await request(portals[0], path(tenants[0], "notes"), {
    method: "POST",
    headers: { origin: portalIssuer, "content-type": "text/plain" },
    body: "exact body",
  });
  assert.equal(post.status, 200);
  assert.equal((await post.json()).body, "exact body");
  denyTenant = tenants[0];
  assert.equal(
    (await request(portals[0], path(tenants[0], "notes"))).status,
    403,
  );
  assert.equal(
    (await request(portals[1], path(tenants[1], "notes"))).status,
    200,
  );
  denyTenant = "";
  const replacement = await register("notes", "nextjs", "v2", next.appId);
  const replaceKey = randomUUID();
  const replacementBody = {
    kind: "replace-deployment",
    deploymentId: next.id,
    replacementId: replacement.id,
    assetsUntil: new Date(Date.now() + 60000).toISOString(),
  };
  await Promise.all([
    command(replacementBody, replaceKey),
    command(replacementBody, replaceKey),
  ]);
  for (const origin of portals) {
    assert.equal(
      (await (await request(origin, path(tenants[0], "notes"))).json())
        .deploymentId,
      replacement.id,
    );
    for (const version of ["v1", "v2"]) {
      const r = await request(origin, asset("notes", version));
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("cache-control"), "no-store");
      assert.equal(r.headers.get("set-cookie"), null);
    }
    assert.notEqual(
      (await request(origin, asset("reports", "v1"))).status,
      200,
    );
  }
  // Advance only this disposable record to simulate the compatibility deadline.
  await pool.query(
    "UPDATE runtime_deployments SET assets_until=now()-interval '1 second' WHERE deployment_id=$1",
    [next.id],
  );
  for (const origin of portals)
    assert.notEqual((await request(origin, asset("notes", "v1"))).status, 200);
  for (const body of [
    {
      ...replacement,
      id: randomUUID(),
      digest: "sha256:" + randomBytes(32).toString("hex"),
    },
    {
      kind: "app",
      id: randomUUID(),
      name: "collision",
      description: "",
      suffix: "/notes",
      active: true,
    },
    {
      kind: "deployment",
      id: replacement.id,
      appId: next.appId,
      digest: replacement.digest,
      reviewer: "registry-integration",
      ready: true,
    },
    { kind: "route", deploymentId: replacement.id, targetOrigin: upstream },
    {
      kind: "app",
      id: next.appId,
      name: "changed",
      description: "",
      suffix: "/new-mount",
      active: true,
    },
  ])
    await assert.rejects(command(body));
  await command({
    kind: "deployment-status",
    deploymentId: replacement.id,
    status: "revoked",
  });
  for (const origin of portals) {
    assert.equal(
      (await request(origin, path(tenants[0], "notes"))).status,
      404,
    );
    assert.notEqual((await request(origin, asset("notes", "v2"))).status, 200);
  }
  await assert.rejects(
    command({
      kind: "deployment-status",
      deploymentId: replacement.id,
      status: "ready",
    }),
  );
  console.log(
    "PASS atomic replacement, old/new assets, expiry, cross-app denial, collision rejection and terminal revocation across replicas",
  );
  if (process.env.SAAS_TENANT_CONSUMER) {
    const publicPath = join(local, "public.pem");
    writeFileSync(
      publicPath,
      keys.publicKey.export({ type: "spki", format: "pem" }),
    );
    const { runtimeNext } = await import("./runtime-next.ts");
    await runtimeNext({
      consumer: process.env.SAAS_TENANT_CONSUMER,
      local,
      portal: portals[0],
      cookie,
      tenants,
      ports: nextPorts,
      env: portalEnv,
      database: dbURL(databases[2]),
      publicKey: publicPath,
      children,
      command,
    });
  }
  await stop(admins[0].child);
  admins[0].child = await start(
    admin,
    { ...env, PORT: admins[0].port },
    "Admin catalog ready",
  );
  assert.equal(
    (await request(portals[0], path(tenants[0], "reports"))).status,
    200,
  );
  await register("assets-live", "nextjs", "v1");
  for (const origin of portals)
    assert.equal(
      (await request(origin, asset("assets-live", "v1"))).status,
      200,
    );
  const privateRouteURL = `/v1/tenants/${tenants[0]}/runtime-route?suffix=/reports`;
  assert.equal((await fetch(admins[0].origin + privateRouteURL)).status, 401);
  const trusted = await (
    await fetch(admins[0].origin + privateRouteURL, {
      headers: {
        "x-portal-key": env.ADMIN_PORTAL_KEY!,
        authorization: "Bearer integration-token",
      },
    })
  ).json();
  authDown = true;
  assert.equal(
    (await request(portals[0], path(tenants[0], "reports"))).status,
    503,
  );
  authDown = false;
  await stop(admins[0].child);
  assert.notEqual(
    (await request(portals[0], path(tenants[0], "reports"))).status,
    200,
  );
  assert.notEqual(
    (await request(portals[0], asset("notes", "v2"))).status,
    200,
  );
  assert.notEqual(
    (await request(portals[0], asset("assets-live", "v1"))).status,
    200,
  );
  let malformedBody: unknown = { ...trusted, status: "revoked" };
  const malformed = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(malformedBody));
  });
  servers.push(malformed);
  malformed.listen(Number(admins[0].port), "127.0.0.1");
  await once(malformed, "listening");
  for (const patch of [
    { status: "revoked" },
    { targetOrigin: "https://unapproved.example" },
    { runtime: "unknown" },
    { deploymentId: null },
  ]) {
    malformedBody = { ...trusted, ...patch };
    assert.notEqual(
      (await request(portals[0], path(tenants[0], "reports"))).status,
      200,
    );
    assert.notEqual(
      (await request(portals[0], asset("assets-live", "v1"))).status,
      200,
    );
  }
  const audit = await pool.query(
    "SELECT body->>'kind' AS kind,actor FROM catalog_operations WHERE body->>'deploymentId'=$1 OR body->>'id'=$1",
    [replacement.id],
  );
  assert.ok(
    audit.rows.some((r: { kind: string }) => r.kind === "runtime-deployment"),
  );
  assert.ok(
    audit.rows.some((r: { kind: string }) => r.kind === "deployment-status"),
  );
  assert.ok(
    audit.rows.every(
      (r: { actor: string }) => r.actor === "registry-integration",
    ),
  );
  console.log(
    "PASS persistence, immediate role denial, Auth/Admin outages and audited mutations (Auth protocol stub; not real Keycloak validation)",
  );
} finally {
  for (const child of children.reverse()) await stop(child);
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
  if (closeStore) await closeStore();
  if (adminPool) await adminPool.end();
  for (const name of databases)
    await setup.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await setup.end();
  rmSync(local, { recursive: true, force: true });
}

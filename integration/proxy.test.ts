import { importPKCS8, SignJWT } from "jose";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import assert from "node:assert/strict";
import { chromium } from "playwright";
function envFile(path: string) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .trim()
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}
const admin = process.env.ADMIN_SOURCE!;
Object.assign(
  process.env,
  envFile(".env.local"),
  envFile(admin + "/.env.local"),
);
const upstreamOrigin = process.env.EXAMPLE_ORIGIN ?? "http://127.0.0.1:59200";
process.env.ADMIN_ALLOWED_APP_ORIGINS = upstreamOrigin;
const runtimeRegistry = process.env.PORTAL_REGISTRY_MODE === "admin";
if (process.env.REQUIRE_RUNTIME_REGISTRY === "true")
  assert.ok(runtimeRegistry, "Real Registry regression requires Admin mode");
const children: ChildProcess[] = [];
async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const ended = once(child, "exit");
  child.kill("SIGTERM");
  await ended;
}
async function replica(
  cwd: string,
  script: string,
  env: Partial<NodeJS.ProcessEnv>,
) {
  const child = spawn(process.execPath, [script], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  // Avoid including credentials or tokens from child diagnostics in test errors.
  child.stderr!.resume();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Replica startup timeout")),
      30000,
    );
    child.stdout!.on("data", (chunk) => {
      if (String(chunk).includes("ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(Error("Replica exited"));
    });
  });
  return child;
}
const { apply, pool } = await import(pathToFileURL(admin + "/src/db.ts").href);
const { get, close } = await import("../lib/store.ts");
const example = envFile(".local/example.env"),
  local = envFile(".local/auth-config/.env");
const origin = process.env.PORTAL_ORIGIN!;
const tag = randomUUID().slice(0, 8);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PORTAL_CHROMIUM,
});
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();
let errors = 0;
page.on("pageerror", () => errors++);
async function command(body: unknown) {
  await apply(body, randomUUID(), "proxy-integration");
}
try {
  await page.goto(origin);
  await page.getByRole("link", { name: "登录 / 注册", exact: true }).click();
  await page.locator('input[name="username"]').fill("local-user");
  await page
    .locator('input[name="password"]')
    .fill(local.SAAS_LOCAL_USER_PASSWORD);
  await page.locator('button[type="submit"],input[type="submit"]').click();
  await page.waitForURL(origin + "/");
  await page.getByRole("heading", { name: /欢迎/ }).waitFor();
  const cookie = (await ctx.cookies()).find(
    (c) => c.name === "__Host-portal-session",
  )!;
  const s = (await get(cookie.value))!;
  async function auth(
    path: string,
    method = "GET",
    body?: unknown,
    etag?: string,
  ) {
    const r = await fetch(process.env.PORTAL_AUTH_URL + path, {
      method,
      headers: {
        authorization: `Bearer ${s.accessToken}`,
        "content-type": "application/json",
        "Idempotency-Key": randomUUID(),
        ...(etag ? { "If-Match": etag } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.ok(r.ok, `Auth failed ${r.status}`);
    return r.status === 204 ? null : r.json();
  }
  const me = await auth("/v1/me");
  const a = await auth("/v1/tenants", "POST", {
      name: "Proxy A " + tag,
      slug: "proxy-a-" + tag,
    }),
    b = await auth("/v1/tenants", "POST", {
      name: "Proxy B " + tag,
      slug: "proxy-b-" + tag,
    });
  const app = {
    kind: "app",
    id: example.EXAMPLE_APP_ID,
    name: "租户报表",
    description: "独立租户数据",
    suffix: "/reports",
    active: true,
  };
  const dep = {
    kind: runtimeRegistry ? "runtime-deployment" : "deployment",
    id: randomUUID(),
    appId: app.id,
    digest: "sha256:" + randomUUID().replaceAll("-", "").repeat(2),
    ...(runtimeRegistry
      ? { targetOrigin: upstreamOrigin, runtime: "http", assetVersion: null }
      : { reviewer: "proxy-test", ready: true }),
  };
  await command(app);
  await command(dep);
  if (runtimeRegistry) {
    await command({
      kind: "deployment-status",
      deploymentId: dep.id,
      status: "ready",
    });
  } else {
    await command({
      kind: "route",
      deploymentId: dep.id,
      targetOrigin: upstreamOrigin,
    });
  }
  await assert.rejects(
    command({
      kind: "route",
      deploymentId: dep.id,
      targetOrigin: "http://169.254.169.254",
    }),
  );
  const install = {
    kind: "installation",
    tenantId: a.id,
    appId: app.id,
    deploymentId: dep.id,
    enabled: true,
    entitled: true,
    validUntil: "2099-01-01T00:00:00Z",
  };
  const grants: Record<string, string> = {};
  const roleIds: Record<string, string> = {};
  for (const tenant of [a.id, b.id]) {
    await command({ ...install, tenantId: tenant });
    const role = await auth(
      `/v1/tenants/${tenant}/apps/${app.id}/roles`,
      "POST",
      { key: "viewer", description: "View reports" },
    );
    const grant = await auth(`/v1/tenants/${tenant}/role-assignments`, "POST", {
      userId: me.user.id,
      roleId: role.id,
    });
    grants[tenant] = grant.id;
    roleIds[tenant] = role.id;
  }
  const aUrl = origin + `/tenants/${a.id}/apps/reports/`,
    bUrl = origin + `/tenants/${b.id}/apps/reports/`;
  await page.goto(origin + "/tenants/" + a.id);
  await page.getByRole("link", { name: "打开应用" }).click();
  await page.waitForURL(aUrl);
  await page.getByRole("heading", { name: "租户报表" }).waitFor();
  assert.equal(await page.title(), "租户报表");
  await page.getByRole("textbox", { name: "记录内容" }).fill("A-only-" + tag);
  await page.getByRole("button", { name: "保存记录" }).click();
  await page.getByText("A-only-" + tag, { exact: true }).waitFor();
  const tab = await ctx.newPage();
  await tab.goto(bUrl);
  await tab.getByRole("heading", { name: "租户报表" }).waitFor();
  assert.equal(
    await tab.getByText("A-only-" + tag, { exact: true }).count(),
    0,
  );
  await tab.getByRole("textbox", { name: "记录内容" }).fill("B-only-" + tag);
  await tab.getByRole("button", { name: "保存记录" }).click();
  await tab.getByText("B-only-" + tag, { exact: true }).waitFor();
  await page.reload();
  await page.getByText("A-only-" + tag, { exact: true }).waitFor();
  assert.equal(
    await page.getByText("B-only-" + tag, { exact: true }).count(),
    0,
  );
  await page.screenshot({
    path: "/private/tmp/portal-proxy-desktop.png",
    fullPage: true,
  });
  await tab.setViewportSize({ width: 390, height: 844 });
  await tab.screenshot({
    path: "/private/tmp/portal-proxy-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await tab.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.equal(errors, 0);
  console.log(
    "PASS real application launch, scripts/styles, POST persistence and two-tab tenant data isolation",
  );
  const spoof = await ctx.request.get(aUrl + "api/notes", {
    headers: {
      "x-saas-request": "forged",
      "x-tenant-id": b.id,
      authorization: "Bearer forged",
      "x-forwarded-host": "evil.test",
    },
  });
  assert.equal(spoof.status(), 200);
  assert.ok((await spoof.text()).includes("A-only-" + tag));
  const csrf = await ctx.request.post(aUrl + "api/notes", {
    headers: { origin: "https://evil.test" },
    data: { body: "forged" },
  });
  assert.equal(csrf.status(), 403);
  const redir = await ctx.request.get(aUrl + "redirect", { maxRedirects: 0 });
  assert.equal(redir.status(), 302);
  assert.equal(redir.headers().location, `/tenants/${a.id}/apps/reports/`);
  assert.equal(redir.headers()["set-cookie"], undefined);
  assert.equal(redir.headers()["x-internal"], undefined);
  const external = await ctx.request.get(aUrl + "external", {
    maxRedirects: 0,
  });
  assert.equal(external.status(), 502);
  const events = await ctx.request.get(aUrl + "events");
  assert.equal(events.status(), 200);
  assert.match(await events.text(), /data: complete/);

  const query = "?tag=one&tag=two&encoded=%E4%B8%AD%20%E6%96%87";
  const queryResponse = await ctx.request.get(aUrl + "echo" + query, {
    headers: { rsc: "1", "next-router-state-tree": '["reports"]' },
  });
  assert.equal(queryResponse.status(), 200);
  const queryData = await queryResponse.json();
  assert.equal(queryData.url, "/reports/echo" + query);
  assert.equal(queryData.rsc, "1");
  assert.equal(queryData.state, '["reports"]');
  const multipartBody = Buffer.from(
    '--native-boundary\r\nContent-Disposition: form-data; name="file"; filename="hello.txt"\r\nContent-Type: text/plain\r\n\r\nhello 世界\r\n--native-boundary--\r\n',
  );
  for (const data of [multipartBody, Buffer.alloc(8 * 1024 * 1024, 97)]) {
    const response = await ctx.request.post(aUrl + "echo", {
      headers: {
        origin,
        "content-type": "multipart/form-data; boundary=native-boundary",
        "next-action": "test-action",
      },
      data,
    });
    assert.equal(response.status(), 200);
    const echoed = await response.json();
    assert.equal(echoed.bytes, data.length);
    assert.equal(echoed.hash, createHash("sha256").update(data).digest("hex"));
    assert.equal(echoed.action, "test-action");
  }
  const oversized = await ctx.request.post(aUrl + "echo", {
    headers: { origin },
    data: Buffer.alloc(8 * 1024 * 1024 + 1),
  });
  assert.equal(oversized.status(), 413);
  const chunked = await fetch(aUrl + "echo", {
    method: "POST",
    headers: { origin, cookie: cookie.name + "=" + cookie.value },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(Buffer.alloc(8 * 1024 * 1024 + 1));
        controller.close();
      },
    }),
    duplex: "half",
    signal: AbortSignal.timeout(10000),
  } as RequestInit & { duplex: string });
  assert.equal(chunked.status, 413);

  console.log(
    "PASS native rewrite preserves query/RSC headers, multipart and exact 8 MiB bodies; rejects oversized upload",
  );
  const direct = await fetch(upstreamOrigin + "/reports/api/notes");
  assert.equal(direct.status, 401);
  const forged = await fetch(upstreamOrigin + "/reports/api/notes", {
    headers: { "x-saas-request": "forged" },
  });
  assert.equal(forged.status, 401);
  const anon = await browser.newContext({ ignoreHTTPSErrors: true });
  assert.equal((await anon.request.get(aUrl + "api/notes")).status(), 401);
  await anon.close();
  const signingKey = await importPKCS8(
    readFileSync(".local/app-private.pem", "utf8"),
    "RS256",
  );
  async function assertion(overrides: Record<string, unknown> = {}) {
    return new SignJWT({
      tenantId: a.id,
      roles: ["viewer"],
      deploymentId: dep.id,
      method: "GET",
      path: "/reports/api/notes",
      basePath: `/tenants/${a.id}/apps/reports`,
      bodyHash: createHash("sha256").update("").digest("hex"),
      ...overrides,
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(origin)
      .setAudience(app.id)
      .setSubject(me.user.id)
      .setIssuedAt()
      .setExpirationTime("30s")
      .setJti(randomUUID())
      .sign(signingKey);
  }
  const signed = await assertion();
  const directUrl = upstreamOrigin + "/reports/api/notes";
  assert.equal(
    (await fetch(directUrl, { headers: { "x-saas-request": signed } })).status,
    200,
  );
  assert.equal(
    (await fetch(directUrl, { headers: { "x-saas-request": signed } })).status,
    401,
  );
  for (const overrides of [
    { method: "POST" },
    { path: "/reports/other" },
    { bodyHash: "bad" },
    { basePath: `/tenants/${b.id}/apps/reports` },
  ])
    assert.equal(
      (
        await fetch(directUrl, {
          headers: { "x-saas-request": await assertion(overrides) },
        })
      ).status,
      403,
    );
  const expired = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(origin)
    .setAudience(app.id)
    .setSubject(me.user.id)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 60)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 30)
    .setJti(randomUUID())
    .sign(signingKey);
  assert.equal(
    (await fetch(directUrl, { headers: { "x-saas-request": expired } })).status,
    401,
  );
  console.log(
    "PASS backend rejects replay, expired signatures, wrong path/method/body and tenant base binding",
  );
  console.log(
    "PASS signed backend authentication, spoofed headers, CSRF, sanitized redirects, cookie isolation and SSE",
  );
  await auth(
    `/v1/tenants/${a.id}/role-assignments/${grants[a.id]}`,
    "DELETE",
    undefined,
    '"1"',
  );
  assert.equal((await ctx.request.get(aUrl + "api/notes")).status(), 403);
  assert.equal((await ctx.request.get(bUrl + "api/notes")).status(), 200);
  await command({ ...install, tenantId: b.id, enabled: false });
  assert.equal((await ctx.request.get(bUrl + "api/notes")).status(), 404);
  console.log(
    "PASS direct application URL denied immediately after role revoke or installation disable",
  );
  if (runtimeRegistry) {
    // Regrant real Auth authorization and re-enable the installation for release checks.
    await auth(`/v1/tenants/${a.id}/role-assignments`, "POST", {
      userId: me.user.id,
      roleId: roleIds[a.id],
    });
    await command({ ...install, tenantId: b.id });
    // Use separate replicas so failure injection never stops an existing service.
    const adminPort = await freePort();
    const adminReplica = await replica(admin, "src/server.ts", {
      PORT: String(adminPort),
    });
    const portalPort = await freePort();
    const portalReplica = await replica(process.cwd(), "server.ts", {
      PORT: String(portalPort),
      PORTAL_ADMIN_URL: `http://127.0.0.1:${adminPort}`,
      PORTAL_TLS_KEY_FILE: ".local/auth-config/.local/tls.key",
      PORTAL_TLS_CERT_FILE: ".local/auth-config/.local/tls.crt",
    });
    const replicaURL = `https://127.0.0.1:${portalPort}/tenants/${a.id}/apps/reports/api/notes`;
    assert.equal((await ctx.request.get(replicaURL)).status(), 200);
    await stop(adminReplica);
    assert.equal((await ctx.request.get(replicaURL)).status(), 502);
    await stop(portalReplica);
    const brokenPort = await freePort();
    const unreachableAuthPort = await freePort();
    const brokenAdmin = await replica(admin, "src/server.ts", {
      PORT: String(brokenPort),
      ADMIN_AUTH_URL: `http://127.0.0.1:${unreachableAuthPort}`,
    });
    const brokenPortalPort = await freePort();
    const brokenPortal = await replica(process.cwd(), "server.ts", {
      PORT: String(brokenPortalPort),
      PORTAL_ADMIN_URL: `http://127.0.0.1:${brokenPort}`,
      PORTAL_TLS_KEY_FILE: ".local/auth-config/.local/tls.key",
      PORTAL_TLS_CERT_FILE: ".local/auth-config/.local/tls.crt",
    });
    assert.equal(
      (
        await ctx.request.get(
          `https://127.0.0.1:${brokenPortalPort}/tenants/${a.id}/apps/reports/api/notes`,
        )
      ).status(),
      503,
    );
    await stop(brokenPortal);
    await stop(brokenAdmin);
    console.log(
      "PASS real logged-in session fails closed after warm Admin loss and Auth unavailability",
    );
    // Explicit opt-in: only pause the disposable Keycloak container belonging to this test.
    const keycloak = process.env.KEYCLOAK_TEST_CONTAINER;
    if (keycloak) {
      assert.match(keycloak, /^saas-saa6-[a-z0-9-]+-keycloak-1$/);
      execFileSync("docker", ["pause", keycloak], { stdio: "ignore" });
      try {
        assert.equal((await ctx.request.get(aUrl + "api/notes")).status(), 503);
      } finally {
        execFileSync("docker", ["unpause", keycloak], { stdio: "ignore" });
      }
      assert.equal((await ctx.request.get(aUrl + "api/notes")).status(), 200);
      console.log(
        "PASS real Keycloak outage denies access and recovery restores authorization",
      );
    } else {
      console.log(
        "SKIP Keycloak outage: no disposable KEYCLOAK_TEST_CONTAINER supplied",
      );
    }
    const next = {
      ...dep,
      id: randomUUID(),
      digest: "sha256:" + randomUUID().replaceAll("-", "").repeat(2),
    };
    await command(next);
    await command({
      kind: "deployment-status",
      deploymentId: next.id,
      status: "ready",
    });
    await command({
      kind: "replace-deployment",
      deploymentId: dep.id,
      replacementId: next.id,
      assetsUntil: new Date(Date.now() + 60000).toISOString(),
    });
    for (const tenant of [a.id, b.id]) {
      const response = await ctx.request.get(
        origin + `/tenants/${tenant}/apps/reports/api/notes`,
      );
      assert.equal(response.status(), 200);
      const route = await fetch(
        process.env.PORTAL_ADMIN_URL +
          `/v1/tenants/${tenant}/runtime-route?suffix=/reports`,
        {
          headers: {
            authorization: `Bearer ${s.accessToken}`,
            "x-portal-key": process.env.PORTAL_ADMIN_KEY!,
          },
        },
      );
      assert.equal(route.status, 200);
      assert.equal((await route.json()).deploymentId, next.id);
    }
    await command({
      kind: "deployment-status",
      deploymentId: next.id,
      status: "revoked",
    });
    for (const url of [aUrl, bUrl])
      assert.equal((await ctx.request.get(url + "api/notes")).status(), 404);
    console.log(
      "PASS real Keycloak authorization with live runtime replacement and deployment revocation",
    );
  }
} finally {
  for (const child of children.reverse()) await stop(child);
  await browser.close();
  await pool.end();
  await close();
}

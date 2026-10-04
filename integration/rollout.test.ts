/** Local rollout only: real identity, legacy-to-Registry switch, rollback and Next releases. */
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { runtimeNext } from "./runtime-next.ts";

function envFile(path: string) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}
const portalEnv = envFile(".env.local");
const admin = process.env.ADMIN_SOURCE!;
Object.assign(process.env, portalEnv, envFile(admin + "/.env.local"));
const example = envFile(".local/example.env");
const local = envFile(".local/auth-config/.env");
const { apply, pool } = await import(pathToFileURL(admin + "/src/db.ts").href);
const { get, close } = await import("../lib/store.ts");
const children: ChildProcess[] = [];
const origin = portalEnv.PORTAL_ORIGIN;
const upstream = portalEnv.EXAMPLE_ORIGIN;
process.env.ADMIN_ALLOWED_APP_ORIGINS = upstream;
const build = readFileSync(".next/BUILD_ID", "utf8");
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await exited;
}
async function portal(
  mode: "environment" | "admin",
  nextOrigins: string[] = [],
) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...portalEnv,
    PORTAL_REGISTRY_MODE: mode,
    PORTAL_TLS_KEY_FILE: ".local/auth-config/.local/tls.key",
    PORTAL_TLS_CERT_FILE: ".local/auth-config/.local/tls.crt",
    PORTAL_APP_EGRESS_ORIGINS: [upstream, ...nextOrigins].join(","),
  };
  for (const key of [
    "PORTAL_ALLOWED_APP_ORIGINS",
    "PORTAL_NEXT_APP_ORIGINS",
    "PORTAL_APP_ASSETS",
  ])
    delete env[key];
  if (mode === "environment") env.PORTAL_ALLOWED_APP_ORIGINS = upstream;
  const child = spawn(process.execPath, ["server.ts"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  child.stderr!.resume();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Portal rollout startup timeout")),
      30000,
    );
    child.stdout!.on("data", (chunk) => {
      if (String(chunk).includes("Portal ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(Error("Portal rollout startup failed"));
    });
  });
  return child;
}
async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return String(address.port);
}
const command = (body: unknown, key: string = randomUUID()) =>
  apply(body, key, "local-rollout-reviewer");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PORTAL_CHROMIUM,
});
try {
  let current = await portal("environment");
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole("link", { name: "登录 / 注册", exact: true }).click();
  await page.locator('input[name="username"]').fill("local-user");
  await page
    .locator('input[name="password"]')
    .fill(local.SAAS_LOCAL_USER_PASSWORD);
  await page.locator('button[type="submit"],input[type="submit"]').click();
  await page.waitForURL(origin + "/");
  await page.getByRole("heading", { name: /欢迎/ }).waitFor();
  const cookie = (await context.cookies()).find(
    (cookie) => cookie.name === "__Host-portal-session",
  )!;
  const session = (await get(cookie.value))!;
  assert.ok(session);
  async function auth(path: string, method = "GET", body?: unknown) {
    const response = await fetch(portalEnv.PORTAL_AUTH_URL + path, {
      method,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.ok(
      response.ok,
      `Real Auth rollout request failed: ${response.status}`,
    );
    return response.status === 204 ? null : response.json();
  }
  const me = await auth("/v1/me");
  const tenants: string[] = [];
  for (const label of ["a", "b"]) {
    const tag = randomUUID().slice(0, 8);
    tenants.push(
      (
        await auth("/v1/tenants", "POST", {
          name: "Rollout " + label + tag,
          slug: "rollout-" + label + tag,
        })
      ).id,
    );
  }
  async function authorize(tenant: string, appId: string) {
    const role = await auth(
      `/v1/tenants/${tenant}/apps/${appId}/roles`,
      "POST",
      { key: "viewer", description: "Local rollout application access" },
    );
    await auth(`/v1/tenants/${tenant}/role-assignments`, "POST", {
      userId: me.user.id,
      roleId: role.id,
    });
  }
  const appId = example.EXAMPLE_APP_ID;
  await command({
    kind: "app",
    id: appId,
    name: "租户报表",
    description: "Local rollout",
    suffix: "/reports",
    active: true,
  });
  const legacyId = randomUUID();
  await command({
    kind: "deployment",
    id: legacyId,
    appId,
    digest: "sha256:" + "a".repeat(64),
    reviewer: "local-rollout-reviewer",
    ready: true,
  });
  await command({
    kind: "route",
    deploymentId: legacyId,
    targetOrigin: upstream,
  });
  const installation = {
    kind: "installation",
    tenantId: tenants[0],
    appId,
    deploymentId: legacyId,
    enabled: true,
    entitled: true,
    validUntil: "2099-01-01T00:00:00Z",
  };
  await command(installation);
  await authorize(tenants[0], appId);
  const notes = origin + `/tenants/${tenants[0]}/apps/reports/api/notes`;
  assert.equal(
    (
      await context.request.post(notes, {
        headers: { origin },
        data: { body: "Before Registry migration" },
      })
    ).status(),
    201,
  );
  assert.match(
    await (await context.request.get(notes)).text(),
    /Before Registry migration/,
  );
  console.log(
    "PASS legacy Portal deployment and authenticated tenant data before cutover",
  );

  const runtimeId = randomUUID();
  await command({
    kind: "runtime-deployment",
    id: runtimeId,
    appId,
    targetOrigin: upstream,
    runtime: "http",
    assetVersion: null,
    digest: "sha256:" + "b".repeat(64),
  });
  await assert.rejects(command({ ...installation, deploymentId: runtimeId }));
  await command({
    kind: "deployment-status",
    deploymentId: runtimeId,
    status: "ready",
  });
  await command({ ...installation, deploymentId: runtimeId });
  // Additive Admin API and database migration preserve the old Portal until cutover.
  assert.equal((await context.request.get(notes)).status(), 200);
  await stop(current);
  const ports = [await freePort(), await freePort(), await freePort()];
  const nextOrigins = ports.map((port) => "http://127.0.0.1:" + port);
  process.env.ADMIN_ALLOWED_APP_ORIGINS = [upstream, ...nextOrigins].join(",");
  current = await portal("admin", nextOrigins);
  assert.match(
    await (await context.request.get(notes)).text(),
    /Before Registry migration/,
  );
  assert.ok(
    await get(cookie.value),
    "Session must survive Portal configuration rollout",
  );
  console.log(
    "PASS Admin-first cutover, pending deployment rejection and existing session/data preservation",
  );
  const pid = current.pid;
  await runtimeNext({
    consumer: process.env.SAAS_TENANT_CONSUMER!,
    local: mkdtempSync(join(tmpdir(), "rollout-next-")),
    portal: origin,
    cookie: `${cookie.name}=${cookie.value}`,
    tenants,
    ports,
    env: {
      ...process.env,
      NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS,
    },
    database: example.EXAMPLE_DATABASE_URL,
    publicKey: example.EXAMPLE_PUBLIC_KEY_FILE,
    children,
    command,
    authorize,
    retentionMs: 15000,
  });
  assert.equal(current.pid, pid);
  assert.equal(current.exitCode, null);
  assert.equal(readFileSync(".next/BUILD_ID", "utf8"), build);
  console.log(
    "PASS onboarding and Next.js releases preserve Portal process and build identity",
  );
  await stop(current);
  current = await portal("environment");
  assert.match(
    await (await context.request.get(notes)).text(),
    /Before Registry migration/,
  );
  await stop(current);
  current = await portal("admin", nextOrigins);
  assert.match(
    await (await context.request.get(notes)).text(),
    /Before Registry migration/,
  );
  console.log(
    "PASS explicit Portal rollback and forward rollout without reverting Admin history or losing sessions",
  );
} finally {
  await browser.close();
  for (const child of children.reverse()) await stop(child);
  await pool.end();
  await close();
}

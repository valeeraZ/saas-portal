import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { importPKCS8, SignJWT } from "jose";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
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
process.env.ADMIN_ALLOWED_APP_ORIGINS =
  "http://127.0.0.1:59200,http://127.0.0.1:59300,http://127.0.0.1:59301";
const { apply, pool } = await import(pathToFileURL(admin + "/src/db.ts").href);
const { get, close } = await import("../lib/store.ts");
const example = envFile(".local/example.env"),
  local = envFile(".local/auth-config/.env");
const origin = process.env.PORTAL_ORIGIN!;
const assetVersion = process.env.SAAS_UI_ASSET_VERSION ?? "demo1";
const tag = randomUUID().slice(0, 8);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PORTAL_CHROMIUM,
});
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const children: ChildProcess[] = [];
const appErrors: string[] = [];
let errors = 0;
page.on("pageerror", () => errors++);
page.on("console", (message) => {
  if (["error", "warning"].includes(message.type()))
    appErrors.push(message.type() + ": " + message.text().slice(0, 180));
});
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
      name: "Next A " + tag,
      slug: "next-a-" + tag,
    }),
    b = await auth("/v1/tenants", "POST", {
      name: "Next B " + tag,
      slug: "next-b-" + tag,
    });

  const consumer = process.env.SAAS_TENANT_CONSUMER!;
  assert.ok(
    consumer,
    "Set SAAS_TENANT_CONSUMER from SDK prepare-tenant-next result",
  );
  const specs = [
    { mount: "next-reports", title: "Next Reports", port: 59300 },
    { mount: "next-metrics", title: "Next Metrics", port: 59301 },
  ];
  const apps: Array<{
    mount: string;
    title: string;
    appId: string;
    deploymentId: string;
    roleGrant: string;
  }> = [];
  for (const spec of specs) {
    const existing = await pool.query(
      "SELECT id FROM app_definitions WHERE suffix=$1",
      ["/" + spec.mount],
    );
    const appId = existing.rows[0]?.id ?? randomUUID(),
      deploymentId = randomUUID();
    await command({
      kind: "app",
      id: appId,
      name: spec.title,
      description: "SDK Next integration",
      suffix: "/" + spec.mount,
      active: true,
    });
    await command({
      kind: "runtime-deployment",
      id: deploymentId,
      appId,
      targetOrigin: "http://127.0.0.1:" + spec.port,
      runtime: "nextjs",
      assetVersion,
      digest:
        "sha256:" +
        createHash("sha256")
          .update(readFileSync(join(consumer, spec.mount, ".next/BUILD_ID")))
          .digest("hex"),
    });
    const child = spawn(process.execPath, ["server.mjs"], {
      cwd: join(consumer, spec.mount),
      env: {
        ...process.env,
        PORT: String(spec.port),
        SAAS_ASSET_VERSION: assetVersion,
        SAAS_PORTAL_ORIGIN: origin,
        SAAS_APP_ID: appId,
        SAAS_DEPLOYMENT_ID: deploymentId,
        SAAS_APP_DATABASE_URL: example.EXAMPLE_DATABASE_URL,
        SAAS_PUBLIC_KEY_FILE: process.env.PORTAL_APP_SIGNING_KEY_FILE!.replace(
          "app-private",
          "app-public",
        ),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    // Capture only counts of runtime diagnostics, never tokens or environment.
    let stderr = "";
    child.stderr!.on("data", (bytes) => {
      stderr += bytes;
    });
    await new Promise<void>((resolve, reject) => {
      child.stdout!.on("data", (bytes) => {
        if (String(bytes).includes("application ready")) resolve();
      });
      child.once("exit", () => reject(new Error("Next child startup failed")));
      setTimeout(
        () => reject(new Error("Next child readiness timeout")),
        20000,
      ).unref();
    });
    await command({ kind: "deployment-status", deploymentId, status: "ready" });
    let roleGrant = "";
    for (const tenant of [a.id, b.id]) {
      await command({
        kind: "installation",
        tenantId: tenant,
        appId,
        deploymentId,
        enabled: true,
        entitled: true,
        validUntil: "2099-01-01T00:00:00Z",
      });
      const role = await auth(
        `/v1/tenants/${tenant}/apps/${appId}/roles`,
        "POST",
        { key: "viewer", description: "Use Next app" },
      );
      const grant = await auth(
        `/v1/tenants/${tenant}/role-assignments`,
        "POST",
        { userId: me.user.id, roleId: role.id },
      );
      if (tenant === a.id) roleGrant = grant.id;
    }
    apps.push({ ...spec, appId, deploymentId, roleGrant });
  }
  const first = apps[0],
    second = apps[1];
  const aUrl = origin + `/tenants/${a.id}/apps/${first.mount}/`,
    bUrl = origin + `/tenants/${b.id}/apps/${first.mount}/`;
  let actions = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"])
      actions++;
  });
  const protocols: string[] = [],
    assets: string[] = [];

  page.on("response", (response) => {
    const type = response.headers()["content-type"] ?? "";
    if (type.includes("text/x-component")) protocols.push(response.url());
    if (response.url().includes("/app-assets/")) assets.push(response.url());
  });
  await page.goto(origin + `/tenants/${a.id}`);
  await page.getByRole("heading", { name: a.name, exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  const portalStyle = await page
    .locator('[data-slot="button"][data-variant="outline"]')
    .first()
    .evaluate((el) => {
      const css = getComputedStyle(el);
      return {
        font: css.fontFamily,
        height: css.height,
        radius: css.borderRadius,
      };
    });
  assert.match(portalStyle.font, /Manrope/);
  assert.equal(portalStyle.height, "32px");
  assert.ok(
    parseFloat(portalStyle.radius) > 0,
    "Shared theme radius must be applied",
  );
  await page.screenshot({
    path: "/private/tmp/saa10-portal-desktop.png",
    fullPage: true,
  });
  const entryResponse = page.waitForResponse(
    (response) =>
      response.url() === aUrl && response.request().isNavigationRequest(),
  );
  await page
    .locator('[data-slot="card"]')
    .filter({ hasText: first.title })
    .getByRole("link", { name: "\u6253\u5f00\u5e94\u7528", exact: true })
    .click();
  const entry = await entryResponse;
  await page.waitForURL(aUrl);
  assert.equal(entry?.status(), 200);
  await page.getByRole("heading", { name: first.title, exact: true }).waitFor();
  assert.equal(await page.title(), first.title);
  await page
    .getByRole("main")
    .getByText("流式内容已加载", { exact: true })
    .waitFor();
  await page.waitForFunction(() =>
    [...document.images].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const childStyle = await page
    .locator('[data-slot="button"][data-variant="outline"]')
    .first()
    .evaluate((el) => {
      const css = getComputedStyle(el);
      return {
        font: css.fontFamily,
        height: css.height,
        radius: css.borderRadius,
      };
    });
  assert.deepEqual(
    childStyle,
    portalStyle,
    "Packed SDK CSS must match Portal UI",
  );
  assert.equal(
    await page.getByRole("main").count(),
    1,
    "Child must render one shared Shell",
  );
  await page
    .getByRole("button", {
      name: "\u4f7f\u7528\u6df1\u8272\u4e3b\u9898",
      exact: true,
    })
    .click();
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.theme === "dark" &&
      document.cookie.includes("saas-theme=dark"),
  );
  const dark = await ctx.request.get(aUrl);
  assert.match(await dark.text(), /<html[^>]*data-theme="dark"/);
  await page.getByRole("button", { name: "\u8bed\u8a00", exact: true }).click();
  await page.getByRole("menuitem", { name: "English", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.lang === "en");
  await page
    .getByRole("main")
    .getByText("Streamed content loaded", { exact: true })
    .waitFor();
  await page.screenshot({
    path: "/private/tmp/saa10-child-dark-en.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Toggle Sidebar", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({
    path: "/private/tmp/saa10-child-mobile-navigation.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(origin);
  await page.waitForFunction(
    () =>
      document.documentElement.lang === "en" &&
      document.documentElement.dataset.theme === "dark",
  );
  await page.getByRole("heading", { name: /Welcome/ }).waitFor();
  await page
    .getByRole("button", { name: "Use light theme", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.cookie.includes("saas-theme=light"),
  );
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "\u4e2d\u6587", exact: true })
    .click();
  await page.waitForFunction(() => document.documentElement.lang === "zh");
  await page.goto(aUrl);
  await page.getByRole("link", { name: "\u8bb0\u5f55\u9875\u9762" }).click();
  await page.waitForURL(aUrl + "notes");
  await page.getByRole("button", { name: "检查 SDK fetch" }).click();
  await page.getByText("API 租户：" + a.id, { exact: true }).waitFor();
  await page.getByRole("textbox", { name: "记录内容" }).fill("Next-A-" + tag);
  await page.getByRole("button", { name: "保存 Server Action" }).click();
  await page.getByText("Next-A-" + tag, { exact: true }).waitFor();
  await page.waitForURL(aUrl + "notes?saved=1");
  await page.getByRole("button", { name: "检查 SDK fetch" }).click();
  await page.getByText("API 租户：" + a.id, { exact: true }).waitFor();
  const tab = await ctx.newPage();
  tab.on("pageerror", () => errors++);
  tab.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      appErrors.push(message.type() + ": " + message.text().slice(0, 180));
  });
  await tab.goto(bUrl + "notes");
  await tab.getByRole("heading", { name: "租户记录" }).waitFor();
  assert.equal(
    await tab.getByText("Next-A-" + tag, { exact: true }).count(),
    0,
  );
  await tab.getByRole("textbox", { name: "记录内容" }).fill("Next-B-" + tag);
  await tab.getByRole("button", { name: "保存 Server Action" }).click();
  await tab.getByText("Next-B-" + tag, { exact: true }).waitFor();
  await page.reload();
  await page.getByText("Next-A-" + tag, { exact: true }).waitFor();
  assert.equal(
    await page.getByText("Next-B-" + tag, { exact: true }).count(),
    0,
  );
  await page.getByRole("link", { name: "应用首页" }).click();
  await page.waitForURL(aUrl);
  await page.goBack();
  await page.waitForURL(aUrl + "notes?saved=1");
  await page.goForward();
  await page.waitForURL(aUrl);
  assert.ok(actions > 0, "Hydrated Next Server Action protocol must execute");
  assert.ok(protocols.length > 0, "Native RSC navigation must execute");
  assert.ok(
    assets.some((url) => url.endsWith(".js")),
    "Next JS must use isolated namespace",
  );
  assert.ok(
    assets.some((url) => url.endsWith(".css")),
    "Next CSS must use isolated namespace",
  );
  assert.ok(
    assets.some((url) => /\.(woff2?|ttf|otf)$/.test(url)),
    "Local font must load through isolated namespace",
  );
  const secondUrl = origin + `/tenants/${a.id}/apps/${second.mount}/`;
  const nextAssets: string[] = [];

  tab.on("response", (response) => {
    if (response.url().includes("/app-assets/"))
      nextAssets.push(response.url());
  });
  await tab.goto(secondUrl);
  await tab.bringToFront();
  await tab.getByRole("heading", { name: second.title, exact: true }).waitFor();
  await tab
    .getByRole("main")
    .getByText("流式内容已加载", { exact: true })
    .waitFor();
  await tab.waitForFunction(() =>
    [...document.images].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  assert.ok(
    nextAssets.some((url) =>
      url.includes("/" + second.mount + "/" + assetVersion + "/"),
    ),
  );
  await tab.evaluate(async () => {
    await document.fonts.ready;
  });
  await tab
    .waitForFunction(
      () => {
        const action = [
          ...document.querySelectorAll(
            'main a[data-slot="button"][data-variant="default"]',
          ),
        ].find((element) => (element as HTMLElement).checkVisibility());
        return action && getComputedStyle(action).height === "32px";
      },
      null,
      { timeout: 10000 },
    )
    .catch(async (error) => {
      const diagnostic = await tab
        .getByRole("main")
        .getByRole("link", { name: "\u8bb0\u5f55\u9875\u9762", exact: true })
        .evaluate((element) => ({
          html: element.outerHTML,
          height: getComputedStyle(element).height,
          display: getComputedStyle(element).display,
          styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map(
            (link) => ({
              href: (link as HTMLLinkElement).href,
              loaded: !!(link as HTMLLinkElement).sheet,
              disabled: (link as HTMLLinkElement).sheet?.disabled,
              media: (link as HTMLLinkElement).media,
              rules: (link as HTMLLinkElement).sheet?.cssRules.length,
              utilities: [
                ...((link as HTMLLinkElement).sheet?.cssRules ?? []),
              ].some((rule) => rule.cssText.includes(".inline-flex")),
            }),
          ),
        }));
      throw new Error(
        "Shared action style: " + JSON.stringify({ diagnostic, appErrors }),
        {
          cause: error,
        },
      );
    });
  await page.screenshot({
    path: "/private/tmp/sdk-tenant-next-desktop.png",
    fullPage: true,
  });
  await tab.setViewportSize({ width: 390, height: 844 });
  await tab.screenshot({
    path: "/private/tmp/sdk-tenant-next-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await tab.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.equal(errors, 0);
  assert.deepEqual(appErrors, []);
  console.log(
    "PASS shared Portal/child typography and components, signed SSR dark theme, bilingual navigation and mobile sidebar",
  );
  console.log(
    "PASS two isolated packed-SDK Next apps: SSR, streaming, JS/CSS/fonts/public/image optimization, RSC navigation, Server Action redirects and tenant-scoped fetch",
  );
  console.log(
    "PASS same-build two-tenant Server Action persistence, direct deep links/reload, history navigation, desktop/mobile and zero browser diagnostics",
  );
  const anon = await browser.newContext({ ignoreHTTPSErrors: true });
  assert.equal((await anon.request.get(aUrl + "api/notes")).status(), 401);
  assert.equal(
    (
      await anon.request.get(assets.find((url) => url.endsWith(".js"))!)
    ).status(),
    200,
  );
  assert.equal(
    (
      await anon.request.get(
        origin +
          "/app-assets/" +
          first.mount +
          "/" +
          assetVersion +
          "/api/notes",
      )
    ).status(),
    404,
  );
  assert.equal(
    (await anon.request.post(assets[0], { data: "forged" })).status(),
    405,
  );
  await anon.close();
  assert.equal(
    (
      await fetch(
        "http://127.0.0.1:59300/tenants/" +
          a.id +
          "/apps/" +
          first.mount +
          "/api/notes",
      )
    ).status,
    401,
  );
  const spoofed = await ctx.request.get(aUrl + "api/notes", {
    headers: {
      authorization: "Bearer forged",
      "x-saas-request": "forged",
      "x-tenant-id": b.id,
    },
  });
  assert.equal(spoofed.status(), 200);
  assert.equal((await spoofed.json()).tenantId, a.id);
  await auth(
    `/v1/tenants/${a.id}/role-assignments/${first.roleGrant}`,
    "DELETE",
    undefined,
    '\"1\"',
  );
  assert.equal((await ctx.request.get(aUrl + "api/notes")).status(), 403);
  assert.equal((await ctx.request.get(bUrl + "api/notes")).status(), 200);
  console.log(
    "PASS anonymous business/direct-upstream denial, public-build-only assets, forged identity isolation and live role revocation",
  );
} finally {
  for (const child of children) child.kill("SIGTERM");
  await ctx.close();
  await browser.close();
  await close();
  await pool.end();
}

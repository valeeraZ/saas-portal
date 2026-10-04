/** Optional real packed-SDK Next.js browser coverage for runtime-registry.test.ts. */
import assert from "node:assert/strict";
import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import { chromium } from "playwright";

type Options = {
  consumer: string;
  local: string;
  portal: string;
  cookie: string;
  tenants: string[];
  ports: string[];
  env: NodeJS.ProcessEnv;
  database: string;
  publicKey: string;
  children: ChildProcess[];
  command: (body: unknown, key?: string) => Promise<void>;
  authorize?: (tenantId: string, appId: string) => Promise<void>;
  retentionMs?: number;
};
export async function runtimeNext(o: Options) {
  const specs = [
    { mount: "next-reports", version: "demo1", title: "Next Reports" },
    { mount: "next-reports", version: "demo2", title: "Next Reports" },
    { mount: "next-metrics", version: "demo1", title: "Next Metrics" },
  ];
  const appIds = { "next-reports": randomUUID(), "next-metrics": randomUUID() };
  const actionKeys = {
    "next-reports": randomBytes(32).toString("base64"),
    "next-metrics": randomBytes(32).toString("base64"),
  };
  const deployments: Array<{
    id: string;
    appId: string;
    mount: string;
    version: string;
    origin: string;
  }> = [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i],
      dir = join(o.local, spec.mount + "-" + spec.version);
    cpSync(join(o.consumer, spec.mount), dir, {
      recursive: true,
      filter: (src) =>
        !src.split(/[\\/]/).some((p) => ["node_modules", ".next"].includes(p)),
    });
    const env = {
      ...o.env,
      SAAS_ASSET_VERSION: spec.version,
      SAAS_PORTAL_ORIGIN: o.portal,
      NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:
        actionKeys[spec.mount as keyof typeof actionKeys],
    };
    for (const args of [
      ["ci", "--no-audit", "--no-fund"],
      ["run", "build"],
    ]) {
      const p = spawn("npm", args, {
        cwd: dir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      o.children.push(p);
      let output = "";
      p.stdout!.on("data", (b) => (output += String(b)));
      p.stderr!.on("data", (b) => (output += String(b)));
      const [code] = await once(p, "exit");
      assert.equal(code, 0, output);
    }
    const appId = appIds[spec.mount as keyof typeof appIds],
      id = randomUUID(),
      origin = "http://127.0.0.1:" + o.ports[i];
    await o.command({
      kind: "app",
      id: appId,
      name: spec.title,
      description: "SDK runtime test",
      suffix: "/" + spec.mount,
      active: true,
    });
    await o.command({
      kind: "runtime-deployment",
      id,
      appId,
      targetOrigin: origin,
      runtime: "nextjs",
      assetVersion: spec.version,
      digest:
        "sha256:" +
        createHash("sha256")
          .update(readFileSync(join(dir, ".next/BUILD_ID")))
          .digest("hex"),
    });
    await o.command({
      kind: "deployment-status",
      deploymentId: id,
      status: "ready",
    });
    const child = spawn(process.execPath, ["server.mjs"], {
      cwd: dir,
      env: {
        ...env,
        PORT: o.ports[i],
        SAAS_APP_ID: appId,
        SAAS_DEPLOYMENT_ID: id,
        SAAS_APP_DATABASE_URL: o.database,
        SAAS_PUBLIC_KEY_FILE: o.publicKey,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    o.children.push(child);
    await new Promise<void>((ok, bad) => {
      let output = "";
      const timer = setTimeout(
        () => bad(Error("Next startup timeout: " + output)),
        20000,
      );
      child.stderr!.on("data", (b) => (output += String(b)));
      child.stdout!.on("data", (b) => {
        if (String(b).includes("application ready")) {
          clearTimeout(timer);
          ok();
        }
      });
      child.once("exit", () => {
        clearTimeout(timer);
        bad(Error(output));
      });
    });
    deployments.push({
      id,
      appId,
      mount: spec.mount,
      version: spec.version,
      origin,
    });
  }
  for (const dep of [deployments[0], deployments[2]])
    for (const tenantId of o.tenants) {
      await o.authorize?.(tenantId, dep.appId);
      await o.command({
        kind: "installation",
        tenantId,
        appId: dep.appId,
        deploymentId: dep.id,
        enabled: true,
        entitled: true,
        validUntil: "2099-01-01T00:00:00Z",
      });
    }
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PORTAL_CHROMIUM,
  });
  try {
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: o.portal.startsWith("https:"),
    });
    const separator = o.cookie.indexOf("=");
    await ctx.addCookies([
      {
        name: o.cookie.slice(0, separator),
        value: o.cookie.slice(separator + 1),
        url: o.portal,
        secure: o.portal.startsWith("https:"),
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const page = await ctx.newPage(),
      errors: string[] = [],
      assets = new Set<string>();
    let actions = 0,
      rsc = 0;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (["warning", "error"].includes(m.type())) errors.push(m.text());
    });
    page.on("request", (r) => {
      if (r.method() === "POST" && r.headers()["next-action"]) actions++;
    });
    page.on("response", (r) => {
      if (r.url().includes("/app-assets/")) assets.add(r.url());
      if (r.headers()["content-type"]?.includes("text/x-component")) rsc++;
    });
    const base = (tenant: string, mount = "next-reports") =>
      o.portal + `/tenants/${tenant}/apps/${mount}/`;
    assert.equal((await page.goto(base(o.tenants[0])))?.status(), 200);
    assert.equal(await page.title(), "Next Reports");
    await page
      .getByRole("heading", { name: "Next Reports", exact: true })
      .waitFor();
    await page.getByText("流式内容已加载", { exact: true }).waitFor();
    await page.getByRole("link", { name: "记录页面" }).click();
    await page.waitForURL(base(o.tenants[0]) + "notes");
    await page.getByRole("button", { name: "检查 SDK fetch" }).click();
    await page
      .getByText("API 租户：" + o.tenants[0], { exact: true })
      .waitFor();
    await page
      .getByRole("textbox", { name: "记录内容" })
      .fill("Registry tenant A");
    await page.getByRole("button", { name: "保存 Server Action" }).click();
    await page.getByText("Registry tenant A", { exact: true }).waitFor();
    await page.waitForURL(base(o.tenants[0]) + "notes?saved=1");
    const oldTab = await ctx.newPage();
    oldTab.on("pageerror", (e) => errors.push(e.message));
    oldTab.on("console", (m) => {
      if (["warning", "error"].includes(m.type())) errors.push(m.text());
    });
    await oldTab.goto(base(o.tenants[1]) + "notes");
    await oldTab.getByRole("heading", { name: "租户记录" }).waitFor();
    assert.equal(
      await oldTab.getByText("Registry tenant A", { exact: true }).count(),
      0,
    );
    assert.ok(actions > 0);
    assert.ok(rsc > 0);
    assert.equal(await page.locator("nextjs-portal").count(), 0);
    const oldAsset = [...assets].find(
      (u) => u.includes("/demo1/") && u.endsWith(".js"),
    );
    assert.ok(oldAsset);
    const assetsUntil = Date.now() + (o.retentionMs ?? 60000);
    await o.command({
      kind: "replace-deployment",
      deploymentId: deployments[0].id,
      replacementId: deployments[1].id,
      assetsUntil: new Date(assetsUntil).toISOString(),
    });
    // The old tab can still use its loaded action and old immutable build assets.
    await oldTab
      .getByRole("textbox", { name: "记录内容" })
      .fill("Old tab after replacement");
    await oldTab.getByRole("button", { name: "保存 Server Action" }).click();
    await oldTab
      .getByText("Old tab after replacement", { exact: true })
      .waitFor();
    await page.reload();
    await page.getByText("Registry tenant A", { exact: true }).waitFor();
    assert.ok(
      [...assets].some((u) => u.includes("/demo2/") && u.endsWith(".js")),
    );
    assert.equal((await ctx.request.get(oldAsset)).status(), 200);
    if (o.retentionMs !== undefined) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, assetsUntil - Date.now() + 250)),
      );
      assert.notEqual((await ctx.request.get(oldAsset)).status(), 200);
      console.log(
        "PASS old Next.js resources expire at the configured retention deadline",
      );
    }
    await page.screenshot({
      path: "/private/tmp/runtime-registry-next-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base(o.tenants[0], "next-metrics"));
    await page
      .getByRole("heading", { name: "Next Metrics", exact: true })
      .waitFor();
    await page.getByText("流式内容已加载", { exact: true }).waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: "/private/tmp/runtime-registry-next-mobile.png",
      fullPage: true,
    });
    assert.equal(
      (
        await fetch(
          deployments[1].origin +
            `/tenants/${o.tenants[0]}/apps/next-reports/api/notes`,
        )
      ).status,
      401,
    );
    await o.command({
      kind: "deployment-status",
      deploymentId: deployments[0].id,
      status: "revoked",
    });
    assert.notEqual((await ctx.request.get(oldAsset)).status(), 200);
    assert.deepEqual(errors, []);
    console.log(
      "PASS real packed-SDK Next.js: SSR, streaming, hydrated RSC and Server Actions, two tenants/apps, live build replacement, old browser tab, retired assets and desktop/mobile",
    );
  } finally {
    await browser.close();
  }
}

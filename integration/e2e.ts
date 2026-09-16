/** Requires the isolated environment from integration/README.md. No fixture. */
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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
Object.assign(process.env, envFile(".env.local"));
process.env.NODE_EXTRA_CA_CERTS ??= new URL(
  "../.local/auth-config/.local/tls.crt",
  import.meta.url,
).pathname;
const local = envFile(".local/auth-config/.env");
const { get, close, put, remove } = await import("../lib/store.ts");
function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PORTAL_CHROMIUM
    ? { executablePath: process.env.PORTAL_CHROMIUM }
    : {}),
});
const origin = process.env.PORTAL_ORIGIN!,
  suffix = randomUUID().slice(0, 8),
  errors: string[] = [];
const owner = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await owner.newPage();
page.on("pageerror", () => errors.push("pageerror"));
async function login(p: typeof page, username: string) {
  await p.goto(origin + "/");
  await p.getByRole("link", { name: "登录 / 注册", exact: true }).click();
  await p.locator('input[name="username"]').fill(username);
  await p
    .locator('input[name="password"]')
    .fill(local.SAAS_LOCAL_USER_PASSWORD);
  await p.locator('button[type="submit"], input[type="submit"]').click();
  await p.waitForURL(origin + "/");
  await p.getByRole("heading", { name: /欢迎/ }).waitFor();
}
async function current(context: typeof owner) {
  const cookie = (await context.cookies()).find(
    (c) => c.name === "__Host-portal-session",
  );
  ensure(
    cookie?.httpOnly && cookie.secure && cookie.sameSite === "Lax",
    "Secure HttpOnly session cookie missing",
  );
  const s = await get(cookie.value);
  ensure(s, "Server session missing");
  return { s, cookie };
}
async function auth(
  path: string,
  token: string,
  method = "GET",
  body?: unknown,
) {
  const r = await fetch(process.env.PORTAL_AUTH_URL + path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  ensure(r.ok, "Real Auth request failed");
  return r.status === 204 ? null : r.json();
}
try {
  await login(page, "local-user");
  const { s, cookie } = await current(owner);
  console.log("PASS real OIDC login and server-only secure session");
  async function create(name: string) {
    await page.getByLabel("租户名称").fill(name);
    await page.getByLabel("地址标识").fill(name);
    await page.getByRole("button", { name: "创建工作空间" }).click();
    await page.waitForURL(/\/tenants\//);
    await page.getByRole("heading", { name, exact: true }).waitFor();
    return page.url().split("/").at(-1)!;
  }
  const a = await create("team-a-" + suffix);
  await page.goto(origin + "/");
  const b = await create("team-b-" + suffix);
  const tab = await owner.newPage();
  await tab.goto(origin + "/tenants/" + a);
  await page.reload();
  ensure(
    page.url().endsWith(b) && tab.url().endsWith(a),
    "Tabs lost independent tenant context",
  );
  await tab.getByRole("heading", { name: "team-a-" + suffix }).waitFor();
  await page.getByRole("heading", { name: "team-b-" + suffix }).waitFor();
  console.log("PASS create and independently select two tenants");
  const forged = await owner.request.post(origin + "/api/tenants", {
    headers: {
      origin: "https://evil.test",
      "x-csrf-token": s.csrf,
      "idempotency-key": randomUUID(),
    },
    data: { name: "blocked", slug: "blocked" },
  });
  ensure(forged.status() === 403, "Cross-origin mutation accepted");
  console.log("PASS CSRF rejection");
  await page.goto(origin + "/");
  const html = await page.content();
  ensure(
    !html.includes(s.accessToken) &&
      !html.includes(s.refreshToken ?? "impossible-value"),
    "Token leaked to HTML",
  );
  await page.screenshot({
    path: process.env.PORTAL_SCREENSHOT ?? "/private/tmp/portal-desktop.png",
    fullPage: true,
  });
  const refreshId = await put("session", { ...s, tokenExpires: 0 }, 28800);
  const refreshContext = await browser.newContext({ ignoreHTTPSErrors: true });
  await refreshContext.addCookies([{ ...cookie, value: refreshId }]);
  const refreshPage = await refreshContext.newPage();
  await refreshPage.goto(origin + "/");
  await refreshPage.getByRole("heading", { name: /欢迎/ }).waitFor();
  ensure(
    (await get(refreshId))!.tokenExpires > Date.now(),
    "Real Keycloak refresh failed",
  );
  await remove(refreshId);
  await refreshContext.close();
  console.log("PASS real Keycloak access token refresh");
  const invitation = await auth(
    `/v1/tenants/${a}/invitations`,
    s.accessToken,
    "POST",
    { email: "local-member@example.com" },
  );
  const wrongEmail = await owner.request.post(
    origin + "/api/invitations/accept",
    {
      headers: {
        origin,
        "x-csrf-token": s.csrf,
        "idempotency-key": randomUUID(),
      },
      data: { token: "x".repeat(43) },
    },
  );
  ensure(
    wrongEmail.status() === 404 || wrongEmail.status() === 403,
    "Invalid owner invite accepted",
  );
  let mail: { text: string } | undefined;
  for (let attempt = 0; attempt < 20; attempt++) {
    execFileSync("python3", ["integration/run.py", "worker"], {
      env: { ...process.env, AUTH_SOURCE: process.env.AUTH_SOURCE },
      stdio: "pipe",
    });
    if (existsSync(".local/latest-mail.json")) {
      const captured = JSON.parse(
        readFileSync(".local/latest-mail.json", "utf8"),
      );
      if (captured.text.includes("team-a-" + suffix)) {
        mail = captured;
        break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  ensure(mail, "Invitation mail was not delivered");
  const link = mail.text.match(/https:\/\/[^\s]+#token=[^\s]+/)?.[0];
  ensure(link, "Invite mail link missing");
  const member = await browser.newContext({ ignoreHTTPSErrors: true });
  const mp = await member.newPage();
  mp.on("pageerror", () => errors.push("member pageerror"));
  await mp.goto(link);
  await mp.getByRole("heading", { name: "加入团队" }).waitFor();
  await mp.waitForFunction(() => !location.hash);
  ensure(!mp.url().includes("token"), "Invite fragment remained in URL");
  await mp.getByRole("link", { name: "登录后接受邀请" }).click();
  await mp.locator('input[name="username"]').fill("local-member");
  await mp
    .locator('input[name="password"]')
    .fill(local.SAAS_LOCAL_USER_PASSWORD);
  await mp.locator('button[type="submit"], input[type="submit"]').click();
  await mp.waitForURL(origin + "/invitations/accept");
  await mp.getByRole("button", { name: "接受邀请" }).click();
  await mp.waitForURL(origin + "/tenants/" + a);
  await mp.getByText("当前角色：member").waitFor();
  console.log(
    "PASS real SMTP invitation -> fragment cleanup -> login -> accept",
  );
  await mp.goto(origin + "/tenants/" + b);
  await mp.getByRole("heading", { name: "无法进入该租户" }).waitFor();
  console.log("PASS cross-tenant member access denied");
  await mp.goto(origin + "/invitations/accept#token=" + "x".repeat(43));
  await mp.getByRole("button", { name: "接受邀请" }).click();
  await mp.locator('[role="alert"]').filter({ hasText: /\S/ }).waitFor();
  ensure(
    mp.url().includes("/invitations/accept"),
    "Invalid invitation accepted",
  );
  console.log("PASS invalid invitation rejection");
  await mp.setViewportSize({ width: 390, height: 844 });
  await mp.goto(origin + "/");
  await mp.screenshot({
    path: "/private/tmp/portal-mobile.png",
    fullPage: true,
  });
  ensure(
    await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Mobile horizontal overflow",
  );
  await page.goto(origin + "/");
  await page.getByRole("button", { name: "退出会话" }).click();
  await page.waitForURL(origin + "/");
  await page.getByRole("link", { name: "登录 / 注册", exact: true }).waitFor();
  ensure((await get(cookie.value)) === null, "BFF session survived logout");
  const revoked = await fetch(process.env.PORTAL_AUTH_URL + "/v1/me", {
    headers: { authorization: `Bearer ${s.accessToken}` },
  });
  ensure(revoked.status === 401, "Old Auth session remains valid");
  console.log("PASS logout clears BFF and revokes real Auth session");
  ensure(errors.length === 0, "Browser runtime error");
  console.log("PASS desktop/mobile render and no runtime errors");
} finally {
  await browser.close();
  await close();
}

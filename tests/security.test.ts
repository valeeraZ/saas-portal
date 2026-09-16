import { test } from "node:test";
import assert from "node:assert/strict";
import { safeReturn, assertOrigin, random, digest } from "../lib/security.ts";
test("return targets reject external URLs, backslashes and API loops", () => {
  for (const value of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/api/auth/login",
    "/ok#token",
    "/x\n",
  ])
    assert.equal(safeReturn(value), "/");
  assert.equal(safeReturn("/tenants/abc?tab=1"), "/tenants/abc?tab=1");
});
test("mutations require exact configured origin", () => {
  assert.throws(() =>
    assertOrigin(
      new Request("https://portal.test", {
        headers: { origin: "https://evil.test" },
      }),
      "https://portal.test",
    ),
  );
  assert.throws(() =>
    assertOrigin(new Request("https://portal.test"), "https://portal.test"),
  );
  assertOrigin(
    new Request("https://portal.test", {
      headers: { origin: "https://portal.test" },
    }),
    "https://portal.test",
  );
});
test("session references contain 256 bits and database identifiers are hashes", () => {
  const id = random();
  assert.equal(Buffer.from(id, "base64url").length, 32);
  assert.notEqual(random(), id);
  assert.match(digest(id), /^[0-9a-f]{64}$/);
});

test("bounded JSON reader rejects oversized and malformed bodies", async () => {
  const { readJson } = await import("../lib/security.ts");
  assert.deepEqual(
    await readJson(
      new Request("https://portal.test", {
        method: "POST",
        body: '{"ok":true}',
      }),
    ),
    { ok: true },
  );
  await assert.rejects(
    readJson(
      new Request("https://portal.test", {
        method: "POST",
        body: "x".repeat(5000),
      }),
    ),
  );
  await assert.rejects(
    readJson(new Request("https://portal.test", { method: "POST", body: "{" })),
  );
});

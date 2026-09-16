import assert from "node:assert/strict";
import test from "node:test";
import { publicAppAsset } from "../lib/app-assets.ts";
test("public asset exception only resolves reviewed immutable JS/CSS/font paths", () => {
  process.env.PORTAL_ALLOWED_APP_ORIGINS = "https://reports.internal";
  process.env.PORTAL_NEXT_APP_ORIGINS = "https://reports.internal";
  process.env.PORTAL_APP_ASSETS = JSON.stringify([
    { mount: "reports", version: "v1", origin: "https://reports.internal" },
  ]);
  const prefix = "https://portal.test/app-assets/reports/v1";
  assert.equal(
    publicAppAsset(new URL(prefix + "/_next/static/chunks/test.js")).origin,
    "https://reports.internal",
  );
  for (const path of [
    "/api/private",
    "/_next/image?url=/secret",
    "/_next/static/chunks/source.map",
    "/_next/static/chunks/test.js?tenant=forged",
    "/_next/static/%2e%2e/api",
    "/public/image.png",
  ])
    assert.throws(() => publicAppAsset(new URL(prefix + path)));
  assert.throws(() =>
    publicAppAsset(
      new URL(prefix.replace("v1", "unknown") + "/_next/static/test.js"),
    ),
  );
});

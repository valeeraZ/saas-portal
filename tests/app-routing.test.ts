process.env.PORTAL_REGISTRY_MODE = "environment";
import { test } from "node:test";
import assert from "node:assert/strict";
import { appPath, target, redirectLocation } from "../lib/app-routing.ts";
test("application paths reject decoded traversal, encoded separators and invalid mounts", () => {
  for (const part of ["..", ".", "%2e%2e", "x/y", "x\\y", "x\n"])
    assert.throws(() => appPath("reports", [part]));
  assert.throws(() => appPath("../auth"));
  assert.equal(appPath("reports", ["a b.js"]).upstream, "/reports/a%20b.js");
});
test("proxy origins must be explicitly allowed and plain origins", () => {
  process.env.PORTAL_ALLOWED_APP_ORIGINS = "https://reports.internal";
  assert.equal(target("https://reports.internal"), "https://reports.internal");
  for (const value of [
    "https://evil.test",
    "https://reports.internal/path",
    "https://user:pass@reports.internal",
    "http://169.254.169.254",
    "file:///etc/passwd",
  ])
    assert.throws(() => target(value));
});
test("redirects preserve application mount and reject external or sibling locations", () => {
  const upstream = new URL("https://reports.internal/reports/form");
  const base = `/apps/reports`;
  assert.equal(
    redirectLocation("/reports/next?x=1", upstream, base, "/reports"),
    base + "/next?x=1",
  );
  for (const location of [
    "https://evil.test/",
    "//evil.test/",
    "/auth",
    "/reports-other/",
    "../admin",
    "https://user:pass@reports.internal/reports/",
  ])
    assert.throws(() => redirectLocation(location, upstream, base, "/reports"));
});

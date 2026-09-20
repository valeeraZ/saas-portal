import test from "node:test";
import assert from "node:assert/strict";
import {
  infrastructureOrigin,
  registryMode,
  runtimeMetadata,
} from "../lib/runtime-registry.ts";
const record = {
  appId: "00000000-0000-4000-8000-000000000001",
  deploymentId: "00000000-0000-4000-8000-000000000002",
  suffix: "/reports",
  targetOrigin: "https://reports.apps.internal",
  runtime: "nextjs",
  assetVersion: "v1",
  status: "ready",
  assetsUntil: null,
  digest: "sha256:" + "a".repeat(64),
  reviewer: "operator",
  reviewedAt: "2026-09-20T00:00:00.000Z",
};
test("Admin ownership is default and rejects mixed projections", () => {
  delete process.env.PORTAL_REGISTRY_MODE;
  assert.equal(registryMode(), "admin");
  for (const k of [
    "PORTAL_ALLOWED_APP_ORIGINS",
    "PORTAL_NEXT_APP_ORIGINS",
    "PORTAL_APP_ASSETS",
  ]) {
    process.env[k] = "[]";
    assert.throws(registryMode);
    delete process.env[k];
  }
  process.env.PORTAL_REGISTRY_MODE = "bad";
  assert.throws(registryMode);
  delete process.env.PORTAL_REGISTRY_MODE;
});
test("runtime metadata binds app namespace, version, review and lifetime", () => {
  process.env.PORTAL_APP_DNS_SUFFIXES = "apps.internal";
  assert.equal(runtimeMetadata(record, "reports").runtime, "nextjs");
  for (const patch of [
    { status: "revoked" },
    { reviewer: "" },
    { digest: "latest" },
    { reviewedAt: "bad" },
    { runtime: "other" },
    { assetVersion: null },
    { targetOrigin: "https://evil.test" },
    { appId: null },
    { assetsUntil: "2099-01-01T00:00:00Z" },
  ])
    assert.throws(() => runtimeMetadata({ ...record, ...patch }, "reports"));
  assert.throws(() => runtimeMetadata(record, "another", "v1"));
  assert.throws(() => runtimeMetadata(record, "reports", "v2"));
  const old = {
    ...record,
    status: "retired",
    assetsUntil: "2099-01-01T00:00:00Z",
  };
  assert.throws(() => runtimeMetadata(old, "reports"));
  assert.equal(runtimeMetadata(old, "reports", "v1").status, "retired");
  assert.throws(() =>
    runtimeMetadata(
      { ...old, assetsUntil: "2000-01-01T00:00:00Z" },
      "reports",
      "v1",
    ),
  );
  for (const value of [
    "https://evilapps.internal",
    "https://reports.apps.internal:8443",
    "https://reports.apps.internal.evil.test",
    "http://reports.apps.internal",
    "http://169.254.169.254",
  ])
    assert.throws(() => infrastructureOrigin(value));
});

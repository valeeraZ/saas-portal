import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDiscovery } from "../lib/discovery-contract.ts";
const app = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Reports",
  description: "Business reports",
  suffix: "/reports",
};
test("discovery includes unauthorized apps without granting roles or exposing route targets", () => {
  assert.deepEqual(parseDiscovery({ items: [app], nextCursor: null }).items, [
    app,
  ]);
  for (const item of [
    { ...app, targetOrigin: "https://internal" },
    { ...app, roles: ["admin"] },
    { ...app, suffix: "/apps/reports" },
    { ...app, id: "invalid" },
  ])
    assert.throws(() => parseDiscovery({ items: [item], nextCursor: null }));
  assert.throws(() => parseDiscovery({ items: [app, app], nextCursor: null }));
  assert.throws(() => parseDiscovery({ items: [app], nextCursor: "invalid" }));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCatalog } from "../lib/catalog.ts";
const tenant = "00000000-0000-4000-8000-000000000001";
const item = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "Reports",
  description: "",
  suffix: "/reports",
  roles: ["viewer"],
};
test("catalog rejects tenant mismatch, internal targets and unsafe paths", () => {
  assert.equal(
    parseCatalog({ tenantId: tenant, items: [item], nextCursor: null }, tenant)
      .items.length,
    1,
  );
  for (const payload of [
    { tenantId: "wrong", items: [], nextCursor: null },
    {
      tenantId: tenant,
      items: [{ ...item, frontendTarget: "http://internal" }],
      nextCursor: null,
    },
    {
      tenantId: tenant,
      items: [{ ...item, suffix: "//evil.test" }],
      nextCursor: null,
    },
    { tenantId: tenant, items: [item, item], nextCursor: null },
  ])
    assert.throws(() => parseCatalog(payload, tenant));
});

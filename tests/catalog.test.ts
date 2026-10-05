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
test("catalog rejects legacy tenant fields, internal targets and unsafe paths", () => {
  assert.equal(
    parseCatalog({ items: [item], nextCursor: null }).items.length,
    1,
  );
  for (const payload of [
    { tenantId: "wrong", items: [], nextCursor: null },
    {
      items: [{ ...item, frontendTarget: "http://internal" }],
      nextCursor: null,
    },
    {
      items: [{ ...item, suffix: "//evil.test" }],
      nextCursor: null,
    },
    { items: [item, item], nextCursor: null },
  ])
    assert.throws(() => parseCatalog(payload));
});

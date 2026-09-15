import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
for (const line of readFileSync(".env.local", "utf8").trim().split("\n")) {
  const at = line.indexOf("=");
  process.env[line.slice(0, at)] = line.slice(at + 1);
}
const store = await import("../lib/store.ts");
const { digest } = await import("../lib/security.ts");
const db = new Pool({ connectionString: process.env.PORTAL_DATABASE_URL });
const session = {
  accessToken: "integration-access-secret",
  idToken: "integration-id-secret",
  csrf: "integration-csrf",
  tokenExpires: Date.now() + 300000,
};
test("real PostgreSQL session invariants", async (t) => {
  const ids: string[] = [];
  try {
    await t.test(
      "encrypted payload round-trip and hashed references",
      async () => {
        const id = await store.put("session", session, 3600);
        ids.push(id);
        const row = (
          await db.query("SELECT id,payload FROM portal_sessions WHERE id=$1", [
            digest(id),
          ])
        ).rows[0];
        assert.equal(row.id, digest(id));
        assert.ok(!row.payload.includes(session.accessToken));
        assert.deepEqual(await store.get(id), session);
      },
    );
    await t.test(
      "login transaction can be consumed only once across replicas",
      async () => {
        const id = await store.put(
          "login",
          { state: "state", verifier: "verifier" },
          600,
        );
        ids.push(id);
        const values = await Promise.all([
          store.consume(id, "login"),
          store.consume(id, "login"),
        ]);
        assert.equal(values.filter(Boolean).length, 1);
      },
    );
    await t.test(
      "absolute expiry and idle expiry reject sessions",
      async () => {
        for (const sql of [
          "expires_at=now()-interval '1 second'",
          "last_seen=now()-interval '31 minutes'",
        ]) {
          const id = await store.put("session", session, 3600);
          ids.push(id);
          await db.query(`UPDATE portal_sessions SET ${sql} WHERE id=$1`, [
            digest(id),
          ]);
          assert.equal(await store.get(id), null);
          assert.equal(await store.refreshed(id, async (s) => s), null);
        }
      },
    );
    await t.test(
      "parallel refresh serializes once and keeps original absolute expiry",
      async () => {
        const id = await store.put(
          "session",
          { ...session, tokenExpires: 0 },
          3600,
        );
        ids.push(id);
        const before = (
          await db.query("SELECT expires_at FROM portal_sessions WHERE id=$1", [
            digest(id),
          ])
        ).rows[0].expires_at;
        let calls = 0;
        const refresh = async (s: typeof session) => {
          calls++;
          await new Promise((r) => setTimeout(r, 30));
          return { ...s, tokenExpires: Date.now() + 300000 };
        };
        await Promise.all([
          store.refreshed(id, refresh),
          store.refreshed(id, refresh),
        ]);
        assert.equal(calls, 1);
        const after = (
          await db.query("SELECT expires_at FROM portal_sessions WHERE id=$1", [
            digest(id),
          ])
        ).rows[0].expires_at;
        assert.equal(+before, +after);
      },
    );
    await t.test("failed refresh rolls back and can be retried", async () => {
      const id = await store.put(
        "session",
        { ...session, tokenExpires: 0 },
        3600,
      );
      ids.push(id);
      await assert.rejects(
        store.refreshed(id, async () => {
          throw new Error("provider unavailable");
        }),
      );
      assert.equal((await store.get(id))?.tokenExpires, 0);
      assert.ok(
        await store.refreshed(id, async (s) => ({
          ...s,
          tokenExpires: Date.now() + 300000,
        })),
      );
    });
    await t.test("ciphertext tampering fails closed", async () => {
      const id = await store.put("session", session, 3600);
      ids.push(id);
      await db.query(
        "UPDATE portal_sessions SET payload='dGFtcGVyZWQ=' WHERE id=$1",
        [digest(id)],
      );
      await assert.rejects(store.get(id));
    });
    await t.test("removal invalidates session references", async () => {
      const id = await store.put("session", session, 3600);
      await store.remove(id);
      assert.equal(await store.get(id), null);
    });
  } finally {
    for (const id of ids) await store.remove(id);
    await db.end();
    await store.close();
  }
});

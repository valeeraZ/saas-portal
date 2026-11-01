import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { createCipheriv, createDecipheriv } from "node:crypto";
import { random, digest } from "./security.ts";
const pool = new Pool({
  connectionString: process.env.PORTAL_DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 3000,
  statement_timeout: 5000,
});
function key() {
  const k = Buffer.from(process.env.PORTAL_SESSION_KEY ?? "", "base64");
  if (k.length !== 32)
    throw new Error("PORTAL_SESSION_KEY must encode 32 bytes");
  return k;
}
function seal(value: unknown) {
  const iv = Buffer.from(random(), "base64url").subarray(0, 12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(value)), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64");
}
function open(value: string) {
  const b = Buffer.from(value, "base64");
  const c = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  c.setAuthTag(b.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([c.update(b.subarray(28)), c.final()]).toString(),
  );
}
export type Session = {
  accessToken: string;
  idToken: string;
  tokenExpires: number;
  csrf: string;
  refreshToken?: string;
};
export async function put(kind: string, value: unknown, seconds: number) {
  const id = random();
  await pool.query(
    "INSERT INTO portal_sessions(id,kind,payload,expires_at,last_seen) VALUES($1,$2,$3,now()+$4*interval '1 second',now())",
    [digest(id), kind, seal(value), seconds],
  );
  return id;
}
export async function consume(id: string, kind: string) {
  const r = await pool.query(
    "DELETE FROM portal_sessions WHERE id=$1 AND kind=$2 AND expires_at>now() RETURNING payload",
    [digest(id), kind],
  );
  return r.rows[0] ? open(r.rows[0].payload) : null;
}
export async function get(id: string): Promise<Session | null> {
  const r = await pool.query(
    "UPDATE portal_sessions SET last_seen=now() WHERE id=$1 AND kind='session' AND expires_at>now() AND last_seen>now()-interval '30 minutes' RETURNING payload",
    [digest(id)],
  );
  return r.rows[0] ? open(r.rows[0].payload) : null;
}
export async function remove(id: string) {
  await pool.query("DELETE FROM portal_sessions WHERE id=$1", [digest(id)]);
}
export async function migrate() {
  await pool.query(
    readFileSync(
      new URL("../migrations/0001_sessions.sql", import.meta.url),
      "utf8",
    ),
  );
}
export async function close() {
  await pool.end();
}

export async function ready() {
  await pool.query("SELECT 1 FROM portal_sessions LIMIT 1");
}

export async function refreshed(
  id: string,
  refresh: (s: Session) => Promise<Session>,
): Promise<Session | null> {
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    const result = await conn.query(
      "SELECT payload FROM portal_sessions WHERE id=$1 AND kind='session' AND expires_at>now() AND last_seen>now()-interval '30 minutes' FOR UPDATE",
      [digest(id)],
    );
    if (!result.rows[0]) {
      await conn.query("COMMIT");
      return null;
    }
    let s: Session = open(result.rows[0].payload);
    if (s.tokenExpires <= Date.now() + 30000) s = await refresh(s);
    await conn.query(
      "UPDATE portal_sessions SET payload=$2,last_seen=now() WHERE id=$1",
      [digest(id), seal(s)],
    );
    await conn.query("COMMIT");
    return s;
  } catch (e) {
    await conn.query("ROLLBACK");
    throw e;
  } finally {
    conn.release();
  }
}
export async function prune() {
  await pool.query(
    "DELETE FROM portal_sessions WHERE expires_at<now() OR (kind='session' AND last_seen<now()-interval '30 minutes')",
  );
}

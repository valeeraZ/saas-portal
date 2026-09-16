"use client";
import { message } from "../lib/messages.ts";
import { useState, useRef } from "react";
export default function Controls({
  csrf,
  verified,
}: {
  csrf: string;
  verified: boolean;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const key = useRef<string | null>(null);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    key.current ??= crypto.randomUUID();
    try {
      const r = await fetch("/api/tenants", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
          "idempotency-key": key.current,
        },
        body: JSON.stringify({
          name: data.get("name"),
          slug: data.get("slug"),
        }),
      });
      const body = await r.json();
      if (!r.ok) {
        if (r.status < 500) key.current = null;
        throw new Error(message(body.error));
      }
      location.assign(`/tenants/${body.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: "{}",
      });
      const body = await r.json();
      if (!r.ok) throw new Error(message(body.error));
      location.assign(body.location);
    } catch (e) {
      setError(e instanceof Error ? e.message : "退出失败");
      setBusy(false);
    }
  }
  return (
    <>
      <section>
        <h2>创建租户</h2>
        {!verified ? <p>请先在身份服务验证邮箱，再创建租户。</p> : null}
        <form onSubmit={create}>
          <label>
            租户名称
            <input name="name" required maxLength={200} />
          </label>
          <label>
            地址标识
            <input
              name="slug"
              required
              maxLength={63}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              placeholder="my-team"
            />
          </label>
          <button disabled={busy || !verified}>创建工作空间</button>
        </form>
      </section>
      <p role="alert">{error}</p>
      <button className="secondary" disabled={busy} onClick={logout}>
        退出会话
      </button>
    </>
  );
}

"use client";
import { useState } from "react";
type Tenant = { id: string; name: string; status: string };
export default function TenantPicker({
  initial,
  cursor: initialCursor,
}: {
  initial: Tenant[];
  cursor: string | null;
}) {
  const [items, setItems] = useState(initial),
    [cursor, setCursor] = useState(initialCursor),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function more() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        "/api/tenants?cursor=" + encodeURIComponent(cursor!),
        { cache: "no-store" },
      );
      const data = await r.json();
      if (!r.ok) throw new Error("暂时无法加载租户，请重试。");
      setItems((previous) => [
        ...previous,
        ...data.items.filter(
          (t: Tenant) => !previous.some((p) => p.id === t.id),
        ),
      ]);
      setCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="grid">
        {items.map((t) => (
          <a className="card" href={`/tenants/${t.id}`} key={t.id}>
            <strong>{t.name}</strong>
            <small>{t.status === "active" ? "可用" : "已暂停"}</small>
          </a>
        ))}
      </div>
      {cursor ? (
        <button className="secondary" disabled={busy} onClick={more}>
          加载更多租户
        </button>
      ) : null}
      <p role="alert">{error}</p>
    </>
  );
}

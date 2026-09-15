"use client";
import { useState } from "react";
import type { Catalog } from "../../../lib/catalog.ts";
export default function Applications({ initial }: { initial: Catalog }) {
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function more() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/tenants/${data.tenantId}/catalog?cursor=${encodeURIComponent(data.nextCursor!)}`,
        { cache: "no-store" },
      );
      if (!r.ok) throw Error("目录暂时不可用，请刷新重试。");
      const next: Catalog = await r.json();
      setData((previous) => ({
        ...next,
        items: [
          ...previous.items,
          ...next.items.filter(
            (item) => !previous.items.some((old) => old.id === item.id),
          ),
        ],
      }));
    } catch (e) {
      setData((previous) => ({ ...previous, items: [] }));
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="grid">
        {data.items.map((item) => (
          <article className="card" key={item.id}>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            <small>你的角色：{item.roles.join("、")}</small>
            <button disabled>应用入口即将开放</button>
          </article>
        ))}
      </div>
      {!data.items.length && !error ? (
        <p>暂无可用应用。请联系租户管理员确认应用开通与角色分配。</p>
      ) : null}
      {data.nextCursor ? (
        <button onClick={more} disabled={busy}>
          加载更多应用
        </button>
      ) : null}
      <p role="alert">{error}</p>
    </>
  );
}

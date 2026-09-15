"use client";
import { message } from "../../../lib/messages.ts";
import { useEffect, useRef, useState } from "react";
export default function Invite({
  csrf,
  email,
  verified,
}: {
  csrf?: string;
  email?: string;
  verified?: boolean;
}) {
  const token = useRef(""),
    key = useRef<string | null>(null);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const fragment = location.hash.slice(1);
    if (fragment) {
      token.current = new URLSearchParams(fragment).get("token") ?? fragment;
      history.replaceState(null, "", location.pathname + location.search);
      sessionStorage.setItem(
        "portal-invite",
        JSON.stringify({ token: token.current, expires: Date.now() + 600000 }),
      );
    } else {
      try {
        const saved = JSON.parse(
          sessionStorage.getItem("portal-invite") ?? "null",
        );
        if (saved?.expires > Date.now()) token.current = saved.token;
        else sessionStorage.removeItem("portal-invite");
      } catch {
        sessionStorage.removeItem("portal-invite");
      }
    }
    setReady(true);
  }, []);
  async function accept() {
    setBusy(true);
    setError("");
    key.current ??= crypto.randomUUID();
    try {
      const r = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf!,
          "idempotency-key": key.current,
        },
        body: JSON.stringify({ token: token.current }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(message(body.error));
      token.current = "";
      sessionStorage.removeItem("portal-invite");
      location.assign(`/tenants/${body.tenantId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "接受失败");
      setBusy(false);
    }
  }
  return (
    <>
      <h1>加入团队</h1>
      <p>使用邀请邮件对应的已验证邮箱接受邀请。</p>
      {ready && !token.current ? (
        <p>邀请令牌缺失或已过期，请重新打开邮件链接。</p>
      ) : csrf ? (
        <>
          <p>当前账户：{email}</p>
          {!verified ? <p>请先验证邮箱后刷新页面。</p> : null}
          <button
            disabled={!ready || !token.current || busy || !verified}
            onClick={accept}
          >
            接受邀请
          </button>
        </>
      ) : (
        <a
          className="button"
          href="/api/auth/login?returnTo=%2Finvitations%2Faccept"
        >
          登录后接受邀请
        </a>
      )}
      <p role="alert">{error}</p>
      <a href="/">返回 Portal</a>
    </>
  );
}

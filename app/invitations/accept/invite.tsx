"use client";
import { errorKey } from "../../../lib/messages.ts";
import { useTranslations } from "next-intl";
import { Button } from "@saas-platform/ui/components/button";
import { Alert, AlertDescription } from "@saas-platform/ui/components/alert";
import { SaasPageHeader } from "@saas-platform/shell/page-header";
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
  const t = useTranslations("Portal");
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
      if (!r.ok) throw new Error(errorKey(body.error));
      token.current = "";
      sessionStorage.removeItem("portal-invite");
      location.assign(`/tenants/${body.tenantId}`);
    } catch (e) {
      setError(
        e instanceof Error ? errorKey(e.message) : "service_unavailable",
      );
      setBusy(false);
    }
  }
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <SaasPageHeader title={t("joinTeam")} description={t("invitationHint")} />
      {ready && !token.current ? (
        <Alert>
          <AlertDescription>{t("missingInvitation")}</AlertDescription>
        </Alert>
      ) : csrf ? (
        <>
          <p>{t("currentAccount", { email: email ?? "" })}</p>
          {!verified ? (
            <Alert>
              <AlertDescription>{t("verifyInvitationEmail")}</AlertDescription>
            </Alert>
          ) : null}
          <Button
            disabled={!ready || !token.current || busy || !verified}
            onClick={accept}
          >
            {t(busy ? "saving" : "acceptInvitation")}
          </Button>
        </>
      ) : (
        <Button asChild>
          <a href="/api/auth/login?returnTo=%2Finvitations%2Faccept">
            {t("signInInvitation")}
          </a>
        </Button>
      )}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${errorKey(error)}`)}</AlertDescription>
        </Alert>
      ) : null}
      <Button asChild variant="outline">
        <a href="/">{t("backToPortal")}</a>
      </Button>
    </div>
  );
}

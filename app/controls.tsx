"use client";
import { errorKey } from "../lib/messages.ts";
import { useTranslations } from "next-intl";
import { Button } from "@saas-platform/ui/components/button";
import { Input } from "@saas-platform/ui/components/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@saas-platform/ui/components/field";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@saas-platform/ui/components/card";
import { Alert, AlertDescription } from "@saas-platform/ui/components/alert";
import { useState, useRef } from "react";
export default function Controls({ csrf }: { csrf: string }) {
  const t = useTranslations("Portal");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
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
      if (!r.ok) throw new Error(errorKey(body.error));
      location.assign(body.location);
    } catch (e) {
      setError(
        e instanceof Error ? errorKey(e.message) : "service_unavailable",
      );
      setBusy(false);
    }
  }
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${errorKey(error)}`)}</AlertDescription>
        </Alert>
      ) : null}
      <Button variant="outline" disabled={busy} onClick={logout}>
        {t("signOut")}
      </Button>
    </div>
  );
}

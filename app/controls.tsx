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
export default function Controls({
  csrf,
  verified,
}: {
  csrf: string;
  verified: boolean;
}) {
  const t = useTranslations("Portal");
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
        throw new Error(errorKey(body.error));
      }
      location.assign(`/tenants/${body.id}`);
    } catch (e) {
      setError(
        e instanceof Error ? errorKey(e.message) : "service_unavailable",
      );
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
      <Card>
        <CardHeader>
          <CardTitle>{t("createTenant")}</CardTitle>
          {!verified ? (
            <CardDescription>{t("verifyEmail")}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          <form onSubmit={create}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="tenant-name">{t("tenantName")}</FieldLabel>
                <Input id="tenant-name" name="name" required maxLength={200} />
              </Field>
              <Field>
                <FieldLabel htmlFor="tenant-slug">{t("slug")}</FieldLabel>
                <Input
                  id="tenant-slug"
                  name="slug"
                  required
                  maxLength={63}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  placeholder={t("slugExample")}
                />
              </Field>
              <Field>
                <Button disabled={busy || !verified}>
                  {t(busy ? "saving" : "createWorkspace")}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
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

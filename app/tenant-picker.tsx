"use client";
import { useTranslations } from "next-intl";
import { Button } from "@saas-platform/ui/components/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@saas-platform/ui/components/card";
import { Badge } from "@saas-platform/ui/components/badge";
import { Alert, AlertDescription } from "@saas-platform/ui/components/alert";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@saas-platform/ui/components/empty";
import { useState } from "react";
type Tenant = { id: string; name: string; status: string };
export default function TenantPicker({
  initial,
  cursor: initialCursor,
}: {
  initial: Tenant[];
  cursor: string | null;
}) {
  const t = useTranslations("Portal");
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
      if (!r.ok) throw new Error("service_unavailable");
      setItems((previous) => [
        ...previous,
        ...data.items.filter(
          (t: Tenant) => !previous.some((p) => p.id === t.id),
        ),
      ]);
      setCursor(data.nextCursor);
    } catch (e) {
      setError("service_unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle>{item.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary">{t(item.status)}</Badge>
            </CardContent>
            <CardFooter>
              <Button asChild variant="outline">
                <a href={`/tenants/${item.id}`}>{t("workspace")}</a>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      {!items.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("noTenants")}</EmptyTitle>
            <EmptyDescription>{t("noTenantsHint")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {cursor ? (
        <Button variant="outline" disabled={busy} onClick={more}>
          {t(busy ? "saving" : "moreTenants")}
        </Button>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t("errors.service_unavailable")}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

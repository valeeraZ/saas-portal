"use client";
import { useTranslations } from "next-intl";
import { Button } from "@saas-platform/ui/components/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@saas-platform/ui/components/card";
import { Alert, AlertDescription } from "@saas-platform/ui/components/alert";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@saas-platform/ui/components/empty";
import { useState } from "react";
import type { Catalog } from "../../../lib/catalog.ts";
export default function Applications({ initial }: { initial: Catalog }) {
  const t = useTranslations("Portal");
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
      if (!r.ok) throw Error("service_unavailable");
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
      setError("service_unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.items.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle>{item.name}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t("appRoles", { roles: item.roles.join(", ") })}
              </p>
            </CardContent>
            <CardFooter>
              <Button asChild>
                <a href={`/tenants/${data.tenantId}/apps${item.suffix}/`}>
                  {t("openApp")}
                </a>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      {!data.items.length && !error ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("noApps")}</EmptyTitle>
            <EmptyDescription>{t("noAppsHint")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {data.nextCursor ? (
        <Button variant="outline" onClick={more} disabled={busy}>
          {t(busy ? "saving" : "moreApps")}
        </Button>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t("catalogUnavailable")}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

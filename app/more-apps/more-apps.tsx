"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type {
  DiscoveryPage,
  DiscoveredApp,
} from "../../lib/discovery-contract.ts";
import { parseDiscovery } from "../../lib/discovery-contract.ts";
import type { AppAccess } from "../../lib/app-access.ts";
import { Button } from "@saas-platform/ui/components/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@saas-platform/ui/components/card";
import { Badge } from "@saas-platform/ui/components/badge";
import { Alert, AlertDescription } from "@saas-platform/ui/components/alert";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldContent,
  FieldDescription,
} from "@saas-platform/ui/components/field";
import { Checkbox } from "@saas-platform/ui/components/checkbox";
import { Textarea } from "@saas-platform/ui/components/textarea";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@saas-platform/ui/components/empty";
function AppCard({ app, csrf }: { app: DiscoveredApp; csrf: string }) {
  const t = useTranslations("Portal"),
    router = useRouter();
  const [access, setAccess] = useState<AppAccess | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const operation = useRef<{ body: string; key: string } | null>(null),
    previous = useRef<string | undefined>(undefined);
  const pending = access?.requests[0]?.status === "pending";
  useEffect(() => {
    let controller: AbortController | undefined;
    async function refresh() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const r = await fetch("/api/app-access?appId=" + app.id, {
          cache: "no-store",
          signal: request.signal,
        });
        if (!r.ok) throw Error();
        const data: AppAccess = await r.json();
        if (request.signal.aborted) return;
        const state = JSON.stringify(data.granted);
        if (previous.current !== undefined && previous.current !== state) {
          window.dispatchEvent(new Event("saas:navigation-refresh"));
          router.refresh();
        }
        previous.current = state;
        setAccess(data);
        setError("");
      } catch {
        if (!request.signal.aborted) {
          setAccess(null);
          setError("accessUnavailable");
        }
      }
    }
    void refresh();
    window.addEventListener("focus", refresh);
    const timer = pending
      ? window.setInterval(() => {
          if (document.visibilityState === "visible") void refresh();
        }, 10000)
      : undefined;
    return () => {
      controller?.abort();
      window.removeEventListener("focus", refresh);
      if (timer) window.clearInterval(timer);
    };
  }, [app.id, retry, pending, router]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const body = JSON.stringify({ appId: app.id, roles: selected, reason });
    if (operation.current?.body !== body)
      operation.current = { body, key: crypto.randomUUID() };
    try {
      const r = await fetch("/api/app-access", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
          "idempotency-key": operation.current.key,
        },
        body,
      });
      const result = await r.json();
      if (!r.ok) {
        if (r.status < 500) operation.current = null;
        throw Error(result.error);
      }
      operation.current = null;
      setSelected([]);
      setReason("");
      setRetry((x) => x + 1);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(
        [
          "pending_request",
          "invalid_roles",
          "already_authorized",
          "csrf",
          "unauthorized",
        ].includes(code)
          ? code
          : "accessUnavailable",
      );
    } finally {
      setBusy(false);
    }
  }
  const latest = access?.requests[0],
    roles = access?.roles ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{app.name}</CardTitle>
        <CardDescription>{app.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {t("accessErrors." + error)}
              <Button
                type="button"
                variant="outline"
                onClick={() => setRetry((x) => x + 1)}
              >
                {t("retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {access?.granted.length ? (
          <div className="flex flex-wrap gap-2">
            <Badge>{t("hasAccess")}</Badge>
            {access.granted.map((r) => (
              <Badge key={r} variant="secondary">
                {roles.find((d) => d.key === r)?.name ?? r}
              </Badge>
            ))}
          </div>
        ) : null}
        {latest ? (
          <Alert>
            <AlertDescription>
              <div className="flex flex-col gap-2">
                <span>{t("requestStatuses." + latest.status)}</span>
                <span>
                  {latest.roles
                    .map((r) => roles.find((d) => d.key === r)?.name ?? r)
                    .join(", ")}
                </span>
                {latest.comment ? (
                  <span className="whitespace-pre-wrap break-words">
                    {t("reviewComment", { comment: latest.comment })}
                  </span>
                ) : null}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        {access && !pending ? (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <FieldGroup>
              <FieldSet disabled={busy}>
                <FieldLegend>{t("selectRoles")}</FieldLegend>
                <FieldDescription>{t("selectRolesHint")}</FieldDescription>
                <FieldGroup>
                  {roles.map((r) => {
                    const granted = access.granted.includes(r.key),
                      id = app.id + "-" + r.key;
                    return (
                      <Field
                        key={r.key}
                        orientation="horizontal"
                        data-disabled={granted || busy}
                      >
                        <Checkbox
                          id={id}
                          disabled={granted || busy}
                          checked={granted || selected.includes(r.key)}
                          onCheckedChange={(checked) =>
                            setSelected((old) =>
                              checked
                                ? [...old, r.key]
                                : old.filter((k) => k !== r.key),
                            )
                          }
                        />
                        <FieldContent>
                          <FieldLabel htmlFor={id}>{r.name}</FieldLabel>
                          {r.description ? (
                            <FieldDescription>{r.description}</FieldDescription>
                          ) : null}
                        </FieldContent>
                      </Field>
                    );
                  })}
                </FieldGroup>
              </FieldSet>
              {roles.some((r) => !access.granted.includes(r.key)) ? (
                <>
                  <Field>
                    <FieldLabel htmlFor={app.id + "-reason"}>
                      {t("requestReason")}
                    </FieldLabel>
                    <Textarea
                      id={app.id + "-reason"}
                      value={reason}
                      disabled={busy}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={2000}
                    />
                  </Field>
                  <Button disabled={busy || !selected.length}>
                    {t(busy ? "submitting" : "requestAccess")}
                  </Button>
                </>
              ) : !roles.length ? (
                <p className="text-muted-foreground text-sm">{t("noRoles")}</p>
              ) : null}
            </FieldGroup>
          </form>
        ) : null}
      </CardContent>
      {access?.granted.length ? (
        <CardFooter>
          <Button asChild variant="outline">
            <a href={"/apps" + app.suffix + "/"}>{t("openApp")}</a>
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
export function MoreApps({
  initial,
  csrf,
}: {
  initial: DiscoveryPage;
  csrf: string;
}) {
  const t = useTranslations("Portal");
  const [page, setPage] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const seen = useRef(new Set<string>());
  async function more() {
    if (!page.nextCursor) return;
    setBusy(true);
    setError(false);
    try {
      if (seen.current.has(page.nextCursor)) throw Error();
      const r = await fetch("/api/discovery?cursor=" + page.nextCursor, {
        cache: "no-store",
      });
      if (!r.ok) throw Error();
      const next = parseDiscovery(await r.json());
      seen.current.add(page.nextCursor);
      setPage((old) => ({
        items: [
          ...new Map(
            [...old.items, ...next.items].map((a) => [a.id, a]),
          ).values(),
        ],
        nextCursor: next.nextCursor,
      }));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!page.items.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("noApps")}</EmptyTitle>
            <EmptyDescription>{t("moreAppsEmpty")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
        {page.items.map((app) => (
          <AppCard key={app.id} app={app} csrf={csrf} />
        ))}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t("retryHint")}</AlertDescription>
        </Alert>
      ) : null}
      {page.nextCursor ? (
        <Button variant="outline" disabled={busy} onClick={more}>
          {t("loadMore")}
        </Button>
      ) : null}
    </>
  );
}

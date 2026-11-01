import { loadCatalog } from "../../../lib/catalog.ts";
import Applications from "./catalog.tsx";
import type { TenantContext, CurrentUser } from "../../../lib/contracts.ts";
import { auth, session, AuthError } from "../../../lib/http.ts";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SaasPageHeader } from "@saas-platform/shell/page-header";
import { Button } from "@saas-platform/ui/components/button";
import { Alert, AlertDescription } from "@saas-platform/ui/components/alert";
import { PortalFrame } from "../../frame.tsx";
export const dynamic = "force-dynamic";
export default async function Tenant({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params,
    t = await getTranslations("Portal");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      tenantId,
    )
  )
    return (
      <PortalFrame>
        <SaasPageHeader title={t("invalidTenant")} />
      </PortalFrame>
    );
  try {
    const s = await session(),
      context = await auth<TenantContext>("/v1/tenant-context", s, "POST", {
        tenantId,
      });
    const [catalog, user] = await Promise.all([
      loadCatalog(tenantId, s).catch(() => null),
      auth<CurrentUser>("/v1/me", s),
    ]);
    return (
      <PortalFrame user={user.user} apps={catalog?.items} tenantId={tenantId}>
        <div className="flex flex-col gap-8">
          <SaasPageHeader
            title={context.tenant.name}
            description={t("tenantRole", {
              role: t(`roles.${context.membership.tenantRole}`),
            })}
            actions={
              <Button asChild variant="outline">
                <a href="/">{t("switchTenant")}</a>
              </Button>
            }
          />
          <p className="break-all font-mono text-xs text-muted-foreground">
            {t("tenantId", { id: context.tenant.id })}
          </p>
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold">{t("applications")}</h2>
            <p className="text-muted-foreground">{t("appsHint")}</p>
            {catalog ? (
              <Applications initial={catalog} />
            ) : (
              <Alert variant="destructive">
                <AlertDescription>{t("catalogUnavailable")}</AlertDescription>
              </Alert>
            )}
          </section>
        </div>
      </PortalFrame>
    );
  } catch (e) {
    if (
      (e instanceof Error && e.message === "unauthorized") ||
      (e instanceof AuthError && e.status === 401)
    )
      redirect(
        `/api/auth/login?returnTo=${encodeURIComponent(`/tenants/${tenantId}`)}`,
      );
    return (
      <PortalFrame>
        <div className="flex flex-col gap-6">
          <SaasPageHeader
            title={t("tenantUnavailable")}
            description={t("tenantUnavailableHint")}
          />
          <Button asChild variant="outline">
            <a href="/">{t("backToTenants")}</a>
          </Button>
        </div>
      </PortalFrame>
    );
  }
}

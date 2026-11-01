import { auth, session, AuthError } from "../lib/http.ts";
import { getTranslations } from "next-intl/server";
import type { CurrentUser } from "../lib/contracts.ts";
import { SaasPageHeader } from "@saas-platform/shell/page-header";
import { Button } from "@saas-platform/ui/components/button";
import { Alert, AlertDescription } from "@saas-platform/ui/components/alert";
import { PortalFrame } from "./frame.tsx";
import TenantPicker from "./tenant-picker.tsx";
import Controls from "./controls.tsx";
export const dynamic = "force-dynamic";
export default async function Home() {
  const t = await getTranslations("Portal");
  try {
    const s = await session(),
      me = await auth<CurrentUser>("/v1/me", s);
    return (
      <PortalFrame user={me.user}>
        <div className="flex flex-col gap-8">
          <SaasPageHeader
            title={t("welcome", { name: me.user.displayName })}
            description={me.user.email}
          />
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold">{t("chooseTenant")}</h2>
            <p className="text-muted-foreground">{t("tenantHint")}</p>
            <TenantPicker initial={me.tenants} cursor={me.nextTenantsCursor} />
          </section>
          <Controls csrf={s.csrf} verified={me.user.emailVerified} />
        </div>
      </PortalFrame>
    );
  } catch (e) {
    const unauthenticated =
      (e instanceof Error && e.message === "unauthorized") ||
      (e instanceof AuthError && e.status === 401);
    return (
      <PortalFrame>
        <div className="flex max-w-2xl flex-col gap-6">
          <SaasPageHeader
            title={t(unauthenticated ? "signInTitle" : "identityUnavailable")}
            description={t(unauthenticated ? "signInHint" : "retryHint")}
          />
          {unauthenticated ? (
            <Button asChild size="lg">
              <a href="/api/auth/login">{t("signIn")}</a>
            </Button>
          ) : (
            <Alert variant="destructive">
              <AlertDescription>{t("retryHint")}</AlertDescription>
            </Alert>
          )}
        </div>
      </PortalFrame>
    );
  }
}

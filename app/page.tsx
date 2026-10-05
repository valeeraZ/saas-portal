import { auth, session, AuthError } from "../lib/http.ts";
import { getTranslations } from "next-intl/server";
import type { CurrentUser } from "../lib/contracts.ts";
import { SaasPageHeader } from "@saas-platform/shell/page-header";
import { Button } from "@saas-platform/ui/components/button";
import { Alert, AlertDescription } from "@saas-platform/ui/components/alert";
import { PortalFrame } from "./frame.tsx";
import Applications from "./applications.tsx";
import { loadAllApps } from "../lib/catalog.ts";
import Controls from "./controls.tsx";
export const dynamic = "force-dynamic";
export default async function Home() {
  const t = await getTranslations("Portal");
  try {
    const s = await session(),
      [me, apps] = await Promise.all([
        auth<CurrentUser>("/v1/me", s),
        loadAllApps(s),
      ]);
    return (
      <PortalFrame user={me.user} apps={apps}>
        <div className="flex flex-col gap-8">
          <SaasPageHeader
            title={t("welcome", { name: me.user.displayName })}
            description={me.user.email}
          />
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold">{t("applications")}</h2>
            <Applications initial={{ items: apps, nextCursor: null }} />
          </section>
          <Controls csrf={s.csrf} />
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

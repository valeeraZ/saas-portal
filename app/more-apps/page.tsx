import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { session, auth, AuthError } from "../../lib/http.ts";
import type { CurrentUser } from "../../lib/contracts.ts";
import { loadAllApps } from "../../lib/catalog.ts";
import { loadDiscovery } from "../../lib/discovery.ts";
import { PortalFrame } from "../frame.tsx";
import { MoreApps } from "./more-apps.tsx";
import { SaasPageHeader } from "@saas-platform/shell/page-header";
export const dynamic = "force-dynamic";
export default async function Page() {
  const t = await getTranslations("Portal");
  let s;
  try {
    s = await session();
  } catch {
    redirect("/api/auth/login?returnTo=/more-apps");
  }
  try {
    const [me, apps, discovery] = await Promise.all([
      auth<CurrentUser>("/v1/me", s),
      loadAllApps(s),
      loadDiscovery(s),
    ]);
    return (
      <PortalFrame user={me.user} apps={apps}>
        <div className="flex flex-col gap-6">
          <SaasPageHeader
            title={t("moreApps")}
            description={t("moreAppsDescription")}
          />
          <MoreApps initial={discovery} csrf={s.csrf} />
        </div>
      </PortalFrame>
    );
  } catch (e) {
    if (e instanceof AuthError && e.status === 401)
      redirect("/api/auth/login?returnTo=/more-apps");
    throw e;
  }
}

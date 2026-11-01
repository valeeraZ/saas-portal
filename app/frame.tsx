import { cookies } from "next/headers";
import { getTranslations, getLocale } from "next-intl/server";
import { SaasPlatformShell } from "@saas-platform/shell/platform-shell";
import {
  createSaasPresentation,
  SAAS_THEME_COOKIE,
  SAAS_SIDEBAR_COOKIE,
} from "@saas-platform/theme";
export async function PortalFrame({
  children,
  user,
  apps = [],
}: {
  children: React.ReactNode;
  user?: { displayName: string; email: string };
  apps?: { id: string; name: string; description: string; suffix: string }[];
}) {
  const [jar, t, locale] = await Promise.all([
    cookies(),
    getTranslations("Portal"),
    getLocale(),
  ]);
  return (
    <SaasPlatformShell
      currentAppLabel={t("brand")}
      initialApps={apps}
      authenticated={!!user}
      user={user ?? { displayName: t("guest"), email: t("guestHint") }}
      presentation={createSaasPresentation({
        theme: jar.get(SAAS_THEME_COOKIE)?.value,
        sidebarCollapsed: jar.get(SAAS_SIDEBAR_COOKIE)?.value === "true",
        locale,
      })}
    >
      {children}
    </SaasPlatformShell>
  );
}

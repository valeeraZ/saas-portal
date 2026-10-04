import { cookies } from "next/headers";
import { getTranslations, getLocale } from "next-intl/server";
import { SaasShell } from "@saas-platform/shell";
import { SaasPresentationControls } from "@saas-platform/shell/presentation-controls";
import { getSaasShellMessages } from "@saas-platform/shell/messages";
import type { SaasNavigationItem } from "@saas-platform/shell/navigation";
import {
  createInitialSaasPreferences,
  SAAS_THEME_COOKIE,
  SAAS_SIDEBAR_COOKIE,
  type SaasLocale,
} from "@saas-platform/theme";
export async function PortalFrame({
  children,
  user,
  apps = [],
  tenantId,
}: {
  children: React.ReactNode;
  user?: { displayName: string; email: string };
  apps?: { id: string; name: string; description: string; suffix: string }[];
  tenantId?: string;
}) {
  const [jar, t, locale] = await Promise.all([
    cookies(),
    getTranslations("Portal"),
    getLocale(),
  ]);
  const navigation: SaasNavigationItem[] = [
    {
      appName: null,
      href: "/",
      label: t("chooseTenant"),
      description: t("tenantHint"),
      kind: "home",
      section: "platform",
    },
    ...apps.map((app) => ({
      appName: app.id,
      href: `/tenants/${tenantId}/apps${app.suffix}/`,
      label: app.name,
      description: app.description,
      kind: "app" as const,
      section: "apps" as const,
    })),
  ];
  return (
    <SaasShell
      canAccessAdmin={false}
      currentAppName="portal"
      currentAppLabel={t("brand")}
      initialPreferences={createInitialSaasPreferences(
        jar.get(SAAS_THEME_COOKIE)?.value,
        jar.get(SAAS_SIDEBAR_COOKIE)?.value,
      )}
      preferencesMode="local"
      navigation={navigation}
      messages={getSaasShellMessages(locale)}
      headerActions={<SaasPresentationControls locale={locale as SaasLocale} />}
      user={{
        displayName: user?.displayName ?? t("guest"),
        secondaryLabel: user?.email ?? t("guestHint"),
      }}
    >
      {children}
    </SaasShell>
  );
}

import "@saas-platform/ui/globals.css";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { cookies } from "next/headers";
import {
  SAAS_THEME_COOKIE,
  createSaasPresentation,
} from "@saas-platform/theme";
export const metadata = {
  title: "SaaS Portal",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, messages, jar] = await Promise.all([
    getLocale(),
    getMessages(),
    cookies(),
  ]);
  const { theme } = createSaasPresentation({
    theme: jar.get(SAAS_THEME_COOKIE)?.value,
  });
  return (
    <html
      lang={locale}
      className={theme === "dark" ? "dark" : undefined}
      data-theme={theme}
      suppressHydrationWarning
    >
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

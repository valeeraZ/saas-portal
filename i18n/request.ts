import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import {
  SAAS_LOCALE_COOKIE,
  createSaasPresentation,
} from "@saas-platform/theme";
export default getRequestConfig(async () => {
  const locale = createSaasPresentation({
    locale: (await cookies()).get(SAAS_LOCALE_COOKIE)?.value,
  }).locale;
  return {
    locale,
    timeZone: "UTC",
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

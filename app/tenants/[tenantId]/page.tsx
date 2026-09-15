import { loadCatalog } from "../../../lib/catalog.ts";
import Applications from "./catalog.tsx";
import type { TenantContext } from "../../../lib/contracts.ts";
import { auth, session, AuthError } from "../../../lib/http.ts";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Tenant({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      tenantId,
    )
  )
    return <h1>租户地址无效</h1>;
  try {
    const s = await session(),
      context = await auth<TenantContext>("/v1/tenant-context", s, "POST", {
        tenantId,
      });
    const catalog = await loadCatalog(tenantId, s).catch(() => null);
    return (
      <>
        <a href="/">← 切换租户</a>
        <h1>{context.tenant.name}</h1>
        <p>当前角色：{context.membership.tenantRole}</p>
        <p>租户：{context.tenant.id}</p>
        <section>
          <h2>应用</h2>
          {catalog ? (
            <Applications initial={catalog} />
          ) : (
            <p role="alert">应用目录暂时不可用，请稍后刷新重试。</p>
          )}
        </section>
      </>
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
      <>
        <h1>无法进入该租户</h1>
        <p>成员资格可能已撤销、租户已暂停，或身份服务暂时不可用。</p>
        <a href="/">返回租户列表</a>
      </>
    );
  }
}

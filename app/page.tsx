import { auth, session, AuthError } from "../lib/http.ts";
import TenantPicker from "./tenant-picker.tsx";
import type { CurrentUser } from "../lib/contracts.ts";
import Controls from "./controls.tsx";
export const dynamic = "force-dynamic";
export default async function Home() {
  try {
    const s = await session(),
      me = await auth<CurrentUser>("/v1/me", s);
    return (
      <>
        <h1>欢迎，{me.user.displayName}</h1>
        <p>{me.user.email}</p>
        <h2>选择租户</h2>
        <p>每个标签页保留独立的租户地址。</p>
        <TenantPicker initial={me.tenants} cursor={me.nextTenantsCursor} />
        {!me.tenants.length ? (
          <p>还没有租户。创建工作空间，或接受成员邀请。</p>
        ) : null}
        <Controls csrf={s.csrf} verified={me.user.emailVerified} />
      </>
    );
  } catch (e) {
    if (
      (e instanceof Error && e.message === "unauthorized") ||
      (e instanceof AuthError && e.status === 401)
    )
      return (
        <>
          <h1>进入你的工作空间</h1>
          <p>使用平台账户登录，创建租户并与团队协作。</p>
          <a className="button" href="/api/auth/login">
            登录 / 注册
          </a>
        </>
      );
    return (
      <>
        <h1>暂时无法连接身份服务</h1>
        <p>请稍后刷新重试。</p>
      </>
    );
  }
}

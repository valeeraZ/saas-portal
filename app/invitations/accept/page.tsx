import { PortalFrame } from "../../frame.tsx";
import type { CurrentUser } from "../../../lib/contracts.ts";
import Invite from "./invite.tsx";
import { session, auth } from "../../../lib/http.ts";
export const dynamic = "force-dynamic";
export default async function Invitation() {
  try {
    const s = await session();
    const me = await auth<CurrentUser>("/v1/me", s);
    return (
      <PortalFrame user={me.user}>
        <Invite
          csrf={s.csrf}
          email={me.user.email}
          verified={me.user.emailVerified}
        />
      </PortalFrame>
    );
  } catch {
    return (
      <PortalFrame>
        <Invite />
      </PortalFrame>
    );
  }
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  mutation,
  auth,
  cookieName,
  cookieOptions,
  failure,
  AuthError,
} from "../../../../lib/http.ts";
import { remove } from "../../../../lib/store.ts";
import { config } from "../../../../lib/config.ts";
import { provider, oidc } from "../../../../lib/oidc.ts";
import { digest } from "../../../../lib/security.ts";
export async function POST(request: Request) {
  try {
    const { s } = await mutation(request, false);
    try {
      await auth(
        "/v1/sessions/current",
        s,
        "DELETE",
        undefined,
        digest(s.csrf),
      );
    } catch (e) {
      if (!(e instanceof AuthError && e.status === 401)) throw e;
    }
    const id = (await cookies()).get(cookieName())?.value;
    if (id) await remove(id);
    let location = config().origin;
    try {
      location = oidc.buildEndSessionUrl(await provider(), {
        id_token_hint: s.idToken,
        post_logout_redirect_uri: config().origin + "/",
      }).href;
    } catch {
      /* Auth persists upstream revocation. */
    }
    const r = NextResponse.json(
      { location },
      { headers: { "Cache-Control": "no-store" } },
    );
    r.cookies.set(cookieName(), "", cookieOptions(0));
    return r;
  } catch (e) {
    return failure(e);
  }
}

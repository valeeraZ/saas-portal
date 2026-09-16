import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { config } from "../../../../lib/config.ts";
import { provider, oidc } from "../../../../lib/oidc.ts";
import { random } from "../../../../lib/security.ts";
import { consume, put, remove } from "../../../../lib/store.ts";
import {
  auth,
  cookieName,
  cookieOptions,
  failure,
} from "../../../../lib/http.ts";
export async function GET(request: Request) {
  try {
    const jar = await cookies(),
      id = jar.get(cookieName("login"))?.value;
    if (!id) throw new Error("unauthorized");
    const tx = await consume(id, "login");
    if (!tx) throw new Error("unauthorized");
    const c = config(),
      url = new URL(c.origin + "/api/auth/callback");
    url.search = new URL(request.url).search;
    const tokens = await oidc.authorizationCodeGrant(await provider(), url, {
      pkceCodeVerifier: tx.verifier,
      expectedState: tx.state,
      expectedNonce: tx.nonce,
      idTokenExpected: true,
    });
    if (!tokens.access_token || !tokens.id_token || !tokens.expires_in)
      throw new Error("unauthorized");
    const s = {
      accessToken: tokens.access_token,
      idToken: tokens.id_token,
      tokenExpires: Date.now() + tokens.expires_in * 1000,
      refreshToken: tokens.refresh_token,
      csrf: random(),
    };
    await auth("/v1/me", s);
    const old = jar.get(cookieName())?.value;
    if (old) await remove(old);
    const sessionId = await put("session", s, 28800);
    const r = NextResponse.redirect(c.origin + tx.returnTo);
    r.cookies.set(cookieName(), sessionId, cookieOptions(28800));
    r.cookies.set(cookieName("login"), "", cookieOptions(0));
    r.headers.set("Cache-Control", "no-store");
    return r;
  } catch (e) {
    const r = failure(e);
    r.cookies.set(cookieName("login"), "", cookieOptions(0));
    return r;
  }
}

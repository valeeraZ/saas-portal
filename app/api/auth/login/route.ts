import { NextResponse } from "next/server";
import { config } from "../../../../lib/config.ts";
import { provider, oidc } from "../../../../lib/oidc.ts";
import { random, safeReturn } from "../../../../lib/security.ts";
import { put } from "../../../../lib/store.ts";
import { cookieName, cookieOptions, failure } from "../../../../lib/http.ts";
export async function GET(request: Request) {
  try {
    const c = config(),
      p = await provider(),
      verifier = oidc.randomPKCECodeVerifier(),
      state = random(),
      nonce = random();
    const id = await put(
      "login",
      {
        verifier,
        state,
        nonce,
        returnTo: safeReturn(new URL(request.url).searchParams.get("returnTo")),
      },
      600,
    );
    const url = oidc.buildAuthorizationUrl(p, {
      redirect_uri: c.origin + "/api/auth/callback",
      scope: "openid profile email",
      state,
      nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: "S256",
    });
    const r = NextResponse.redirect(url);
    r.cookies.set(cookieName("login"), id, cookieOptions(600));
    r.headers.set("Cache-Control", "no-store");
    return r;
  } catch (e) {
    return failure(e);
  }
}

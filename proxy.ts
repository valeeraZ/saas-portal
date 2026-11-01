import { NextResponse, type NextRequest } from "next/server";
import { publicAppAsset } from "./lib/app-assets.ts";
import { ProxyError } from "./lib/app-routing.ts";
import { forward } from "./lib/app-proxy.ts";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/app-assets/")) {
    try {
      if (!["GET", "HEAD"].includes(request.method)) throw new ProxyError(405);
      const url = await publicAppAsset(request.nextUrl);
      return NextResponse.rewrite(url, {
        request: {
          headers: new Headers({
            host: url.host,
            "accept-encoding": "identity",
            accept: "*/*",
          }),
        },
      });
    } catch (error) {
      return NextResponse.json(
        { error: "build_asset_unavailable" },
        {
          status: error instanceof ProxyError ? error.status : 503,
          headers: { "cache-control": "no-store" },
        },
      );
    }
  }
  const match = /^\/apps\/([^/]+)(?:\/(.*))?$/.exec(request.nextUrl.pathname);
  if (!match) return NextResponse.next();
  try {
    return await forward(request, {
      mount: decodeURIComponent(match[1]),
      path: match[2] ? match[2].split("/").map(decodeURIComponent) : [],
    });
  } catch {
    return NextResponse.json(
      { error: "invalid_application_path" },
      {
        status: 400,
        headers: { "cache-control": "no-store" },
      },
    );
  }
}

export const config = {
  matcher: ["/apps/:path*", "/app-assets/:path*"],
};

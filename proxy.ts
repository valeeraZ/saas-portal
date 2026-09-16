import { NextResponse, type NextRequest } from "next/server";
import { forward } from "./lib/app-proxy.ts";

export async function proxy(request: NextRequest) {
  const match = /^\/tenants\/([^/]+)\/apps\/([^/]+)(?:\/(.*))?$/.exec(
    request.nextUrl.pathname,
  );
  if (!match) return NextResponse.next();
  try {
    return await forward(request, {
      tenantId: decodeURIComponent(match[1]),
      mount: decodeURIComponent(match[2]),
      path: match[3] ? match[3].split("/").map(decodeURIComponent) : [],
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
  matcher: ["/tenants/:tenantId/apps/:path*"],
};

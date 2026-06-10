/**
 * Edge middleware that gates the app behind a single beta password when
 * `BETA_PASSWORD` is set. See lib/auth.ts for details.
 *
 * Open routes (no gate even when active):
 *   /login                 - the login page itself
 *   /api/auth/*            - login + logout endpoints
 *   /_next/*               - Next.js assets
 *   /favicon.ico, /robots.txt
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  BETA_COOKIE_NAME,
  isGateActive,
  validateSessionCookie,
} from "@/lib/auth";

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     *   - _next/static, _next/image (assets)
     *   - favicon.ico, robots.txt, sitemap.xml
     *   - the login page itself and its API
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|login|api/auth).*)",
  ],
};

export async function middleware(req: NextRequest) {
  if (!isGateActive()) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(BETA_COOKIE_NAME)?.value;
  const ok = await validateSessionCookie(cookie);
  if (ok) {
    return NextResponse.next();
  }

  // For HTML page requests, redirect to /login. For API/JSON, return 401.
  const accept = req.headers.get("accept") ?? "";
  const isHtml = accept.includes("text/html");

  if (isHtml) {
    const url = req.nextUrl.clone();
    const next = req.nextUrl.pathname + req.nextUrl.search;
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(url);
  }

  return new NextResponse(
    JSON.stringify({ error: "Unauthorized" }),
    {
      status: 401,
      headers: { "content-type": "application/json" },
    },
  );
}

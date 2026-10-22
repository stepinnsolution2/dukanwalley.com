import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isStaff } from "@/lib/permissions";


export async function proxy(req: NextRequest) {
  // Behind Nginx the app sees plain http, but on https Auth.js stores the session in
  // the "__Secure-" prefixed cookie, so pick the cookie name from the visitor's protocol.
  const secureCookie =
    req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:";
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie,
  });
  const { pathname } = req.nextUrl;
  const role = token?.role as string | undefined;

  if (pathname.startsWith("/admin")) {
    if (!token) {
      return NextResponse.redirect(new URL("/auth/login?next=/admin", req.url));
    }
    if (!isStaff(role)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  if (pathname.startsWith("/sales")) {
    if (!token) {
      return NextResponse.redirect(new URL("/auth/login?next=/sales", req.url));
    }
    if (role !== "SALES") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  if (pathname.startsWith("/vendor")) {
    if (pathname === "/vendor/register") return NextResponse.next();
    if (!token) {
      return NextResponse.redirect(new URL("/auth/login?next=/vendor", req.url));
    }
    if (role !== "VENDOR") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/sales/:path*", "/vendor/:path*"],
};

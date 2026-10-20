import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isStaff } from "@/lib/permissions";


export async function proxy(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
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

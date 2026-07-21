import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { ApiResponse } from "@kpblog/contracts";

interface SessionResponse {
  authenticated: boolean;
  role: "ADMIN" | "USER";
}

function loginRedirect(request: NextRequest) {
  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/admin") || pathname.startsWith("/admin/login")) {
    return NextResponse.next();
  }

  const cookie = request.headers.get("cookie");
  if (!cookie) return loginRedirect(request);

  try {
    const apiUrl = (process.env.API_INTERNAL_URL || "http://127.0.0.1:3002").replace(/\/$/, "");
    const response = await fetch(`${apiUrl}/api/auth/me`, {
      headers: { Cookie: cookie, Accept: "application/json" },
      cache: "no-store",
    });
    const payload = await response.json() as ApiResponse<SessionResponse>;
    if (response.ok && payload.success && payload.data.role === "ADMIN") {
      return NextResponse.next();
    }
  } catch {
    // Treat an unavailable or invalid session service as unauthenticated.
  }

  return loginRedirect(request);
}

export const config = {
  matcher: "/admin/:path*",
};

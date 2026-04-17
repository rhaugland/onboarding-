import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const apiUrl = process.env.API_URL || "http://localhost:3011";
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, apiUrl);
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};

import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js middleware to add CORS headers.
 *
 * Allows requests from:
 * - Same-origin (Electron renderer)
 * - Chrome extension origins (chrome-extension://)
 * - localhost (development)
 *
 * Rejects cross-origin requests from arbitrary websites.
 */
export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = isAllowedOrigin(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(allowed ? origin : ""),
    });
  }

  // Add CORS headers to all API responses
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(
    corsHeaders(allowed ? origin : "")
  )) {
    response.headers.set(key, value);
  }
  return response;
}

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return true; // Same-origin (no Origin header)
  if (origin.startsWith("chrome-extension://")) return true;
  if (origin.startsWith("http://localhost")) return true;
  if (origin.startsWith("http://127.0.0.1")) return true;
  return false;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin || "http://localhost:3099",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Webhook-Secret",
    Vary: "Origin",
  };
}

export const config = {
  matcher: "/api/:path*",
};

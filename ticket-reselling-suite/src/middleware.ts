import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js middleware to add CORS headers for Chrome extension requests.
 * Extension service workers make cross-origin requests from marketplace domains.
 */
export function middleware(req: NextRequest) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  // Add CORS headers to all API responses
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(corsHeaders())) {
    response.headers.set(key, value);
  }
  return response;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Webhook-Secret",
  };
}

export const config = {
  matcher: "/api/:path*",
};

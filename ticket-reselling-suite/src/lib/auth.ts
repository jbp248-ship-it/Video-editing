import { NextRequest, NextResponse } from "next/server";

/**
 * API Authentication Middleware
 *
 * Protects mutation endpoints with a bearer token.
 * The token is set via API_SECRET in .env.
 *
 * GET endpoints (dashboard reads) are allowed without auth when
 * the request comes from localhost (Electron app / local dev).
 * External POST/PATCH/DELETE requests always require the token.
 */

export function requireAuth(
  req: NextRequest,
  options: { allowLocalReads?: boolean } = {}
): NextResponse | null {
  const { allowLocalReads = true } = options;

  // Allow all requests if no API_SECRET is configured (local-only mode)
  const secret = process.env.API_SECRET;
  if (!secret) return null;

  // Allow local GET requests (from Electron/browser on same machine)
  if (allowLocalReads && req.method === "GET") {
    const host = req.headers.get("host") ?? "";
    if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
      return null;
    }
  }

  // Check bearer token
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (token !== secret) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null; // Auth passed
}

/**
 * Verify Postmark webhook signature.
 * Checks that the request contains the expected webhook secret.
 */
export function verifyWebhookSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.POSTMARK_WEBHOOK_SECRET;
  if (!secret) return null; // No secret configured, skip verification

  // Postmark doesn't sign payloads, but we can use a secret URL param
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (token !== secret) {
    return NextResponse.json(
      { error: "Invalid webhook token" },
      { status: 403 }
    );
  }

  return null; // Verified
}

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * API Authentication Middleware
 *
 * Auth model:
 * - If API_SECRET is not set, auth is DISABLED (local-only desktop use).
 *   A console warning is emitted on first request.
 * - If API_SECRET is set, all requests require a Bearer token.
 *   GET requests from the Electron renderer (same-origin, no token) are
 *   exempted by checking the Sec-Fetch-Site header, which browsers set
 *   and cannot be spoofed from cross-origin contexts.
 */

let warnedNoSecret = false;

export function requireAuth(
  req: NextRequest,
  options: { allowLocalReads?: boolean } = {}
): NextResponse | null {
  const { allowLocalReads = true } = options;

  const secret = process.env.API_SECRET;

  // No secret configured — local desktop mode, auth disabled
  if (!secret) {
    if (!warnedNoSecret) {
      console.warn(
        "[TicketOps] WARNING: API_SECRET is not set. All API endpoints are unauthenticated. " +
          "Set API_SECRET in .env if you expose this app beyond localhost."
      );
      warnedNoSecret = true;
    }
    return null;
  }

  // Allow same-origin GET requests from the Electron renderer.
  // Sec-Fetch-Site is set by browsers and cannot be forged by cross-origin requests.
  if (allowLocalReads && req.method === "GET") {
    const fetchSite = req.headers.get("sec-fetch-site");
    if (fetchSite === "same-origin" || fetchSite === "none") {
      return null;
    }
  }

  // Check bearer token
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token || !timingSafeEqual(token, secret)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null;
}

/**
 * Verify Postmark webhook signature via X-Webhook-Secret header.
 * Postmark should be configured to send this header with each webhook delivery.
 */
export function verifyWebhookSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.POSTMARK_WEBHOOK_SECRET;

  // No secret configured — reject all webhooks to prevent silent insecurity
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook secret not configured. Set POSTMARK_WEBHOOK_SECRET in .env." },
      { status: 503 }
    );
  }

  // Check header (not URL parameter — headers don't leak into logs)
  const provided =
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-postmark-secret") ??
    // Fallback: also accept URL param for backwards compat during migration
    new URL(req.url).searchParams.get("token");

  if (!provided || !timingSafeEqual(provided, secret)) {
    return NextResponse.json(
      { error: "Invalid webhook secret" },
      { status: 403 }
    );
  }

  return null;
}

/** Constant-time string comparison to prevent timing attacks */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

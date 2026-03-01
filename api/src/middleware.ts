import { NextRequest, NextResponse } from 'next/server';

/**
 * CORS + API Key middleware for the Blink API.
 *
 * CORS: Allows any origin to call /api/v1/* endpoints.
 * API Key: When BLINK_API_KEY is set, all non-docs endpoints
 *          require an X-API-Key header. This lets external companies
 *          authenticate with the API.
 *
 * To enable API key auth, set:
 *   BLINK_API_KEY=your-secret-key-here
 *
 * Clients include the key as:
 *   curl -H "X-API-Key: your-secret-key-here" https://api.blink.app/api/v1/rooms
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-API-Key, Cache-Control, Pragma',
  'Access-Control-Max-Age': '86400',
};

/** Paths that are always public (no API key required) */
const PUBLIC_PATHS = [
  '/api/v1/docs',
  '/api/v1/webhooks/stripe',   // Stripe verifies its own signatures
];

export function middleware(request: NextRequest) {
  // Handle preflight OPTIONS
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  // API Key authentication (when configured)
  const expectedKey = process.env.BLINK_API_KEY;
  if (expectedKey) {
    const isPublicPath = PUBLIC_PATHS.some((p) =>
      request.nextUrl.pathname.startsWith(p)
    );

    if (!isPublicPath) {
      const providedKey = request.headers.get('X-API-Key');
      if (providedKey !== expectedKey) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid or missing API key. Include X-API-Key header.',
          },
          { status: 401, headers: CORS_HEADERS }
        );
      }
    }
  }

  // For actual requests, add CORS headers to the response
  const response = NextResponse.next();
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export const config = {
  matcher: '/api/v1/:path*',
};

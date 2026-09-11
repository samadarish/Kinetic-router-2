import { NextResponse, type NextRequest } from 'next/server';
import { isProductionHostname, isUtilityRoute } from './data/seo-policy.mjs';

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  if (!isProductionHostname(request.nextUrl.hostname) || isUtilityRoute(request.nextUrl.pathname)) {
    response.headers.set('X-Robots-Tag', 'noindex, follow');
  }
  return response;
}

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/internal", "/api/campaigns", "/api/catalogue/admin"];

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="AFR Internal", charset="UTF-8"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function normalizeHost(hostHeader: string | null): string {
  if (!hostHeader) return "";
  return hostHeader.toLowerCase().replace(/:\d+$/, "");
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function shouldBypassCatalogueRewrite(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/fonts") ||
    pathname.startsWith("/public") ||
    pathname.startsWith("/catalogue") ||
    /\.[a-z0-9]+$/i.test(pathname)
  );
}

function applyInternalBasicAuth(req: NextRequest): NextResponse | null {
  const { pathname } = req.nextUrl;

  if (!isProtectedPath(pathname)) return null;

  const user = process.env.INTERNAL_BASIC_AUTH_USER;
  const pass = process.env.INTERNAL_BASIC_AUTH_PASS;

  if (!user || !pass) return unauthorized();

  const authHeader = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = authHeader.split(" ");

  if (scheme !== "Basic" || !encoded) return unauthorized();

  let decoded = "";
  try {
    decoded = atob(encoded);
  } catch {
    return unauthorized();
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return unauthorized();

  const providedUser = decoded.slice(0, separatorIndex);
  const providedPass = decoded.slice(separatorIndex + 1);

  if (providedUser !== user || providedPass !== pass) {
    return unauthorized();
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

function applyCatalogueCanonicalRedirect(req: NextRequest): NextResponse | null {
  const catalogueHost = process.env.CATALOGUE_SUBDOMAIN_HOST?.trim().toLowerCase();
  const requestHost = normalizeHost(req.headers.get("host"));
  const { pathname, search } = req.nextUrl;

  if (!catalogueHost) return null;

  const isOnCatalogueHost = requestHost === catalogueHost;
  const isCataloguePath =
    pathname === "/catalogue" || pathname.startsWith("/catalogue/");

  if (!isOnCatalogueHost && isCataloguePath) {
    const nextPath =
      pathname === "/catalogue"
        ? "/"
        : pathname.replace(/^\/catalogue/, "");

    const redirectUrl = new URL(`https://${catalogueHost}${nextPath}${search}`);
    return NextResponse.redirect(redirectUrl, 308);
  }

  return null;
}

function applyCatalogueSubdomainRewrite(req: NextRequest): NextResponse | null {
  const catalogueHost = process.env.CATALOGUE_SUBDOMAIN_HOST?.trim().toLowerCase();
  const requestHost = normalizeHost(req.headers.get("host"));
  const { pathname, search } = req.nextUrl;

  if (!catalogueHost || requestHost !== catalogueHost) {
    return null;
  }

  if (shouldBypassCatalogueRewrite(pathname)) {
    return null;
  }

  const rewriteUrl = req.nextUrl.clone();
  rewriteUrl.pathname = pathname === "/" ? "/catalogue" : `/catalogue${pathname}`;
  rewriteUrl.search = search;

  return NextResponse.rewrite(rewriteUrl);
}

export function middleware(req: NextRequest): NextResponse {
  const authResponse = applyInternalBasicAuth(req);
  if (authResponse) return authResponse;

  const redirectResponse = applyCatalogueCanonicalRedirect(req);
  if (redirectResponse) return redirectResponse;

  const rewriteResponse = applyCatalogueSubdomainRewrite(req);
  if (rewriteResponse) return rewriteResponse;

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
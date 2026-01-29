// middleware.ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

const PROTECTED_PREFIXES = ['/internal', '/api/campaigns']

function unauthorized() {
  return new NextResponse('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="AFR Internal", charset="UTF-8"',
      // mild hardening
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
  if (!isProtected) return NextResponse.next()

  const user = process.env.INTERNAL_BASIC_AUTH_USER
  const pass = process.env.INTERNAL_BASIC_AUTH_PASS

  // Fail-closed if env isn't set in prod.
  if (!user || !pass) return unauthorized()

  const auth = req.headers.get('authorization') || ''
  const [scheme, encoded] = auth.split(' ')

  if (scheme !== 'Basic' || !encoded) return unauthorized()

  let decoded = ''
  try {
    decoded = atob(encoded)
  } catch {
    return unauthorized()
  }

  const [u, p] = decoded.split(':')
  if (u !== user || p !== pass) return unauthorized()

  // Optional: add headers so nothing gets cached between users.
  const res = NextResponse.next()
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return res
}

// Limit where the middleware runs (keeps perf sane).
export const config = {
  matcher: ['/internal/:path*', '/api/campaigns/:path*'],
}

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import {
  clearSupabaseAuthCookies,
  isRefreshTokenNotFoundError,
} from '@/lib/supabase-auth'
import { isCrossSiteRequestHeaders } from '@/lib/request-origin.mjs'

/**
 * Reject cross-site POSTs so another site cannot sign the user out with a
 * hidden auto-submitting form.
 *
 * Browsers send `Origin` on every cross-site POST and `Sec-Fetch-Site` on all
 * modern requests, so a forged request cannot suppress both. When neither
 * header is present the request is allowed through: that is a non-browser
 * client (curl, a health check), which cannot be used to attack a user's
 * session because it carries no ambient cookies.
 */
function isCrossSiteRequest(request: NextRequest): boolean {
  return isCrossSiteRequestHeaders({
    secFetchSite: request.headers.get('sec-fetch-site'),
    origin: request.headers.get('origin'),
    host: request.headers.get('host'),
    forwardedProto: request.headers.get('x-forwarded-proto'),
    fallbackProtocol: request.nextUrl.protocol,
  })
}

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      { error: 'Cross-site sign-out requests are not allowed' },
      { status: 403 }
    )
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { error } = await supabase.auth.signOut()

  const { origin } = new URL(request.url)
  const response = NextResponse.redirect(`${origin}/login`, { status: 302 })

  if (isRefreshTokenNotFoundError(error)) {
    return clearSupabaseAuthCookies(request, response)
  }

  return response
}

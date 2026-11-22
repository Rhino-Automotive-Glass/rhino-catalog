import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type { AuthCallbackErrorCode } from '@/lib/auth/constants'

/**
 * Landing route for every Supabase auth email link (signup confirmation,
 * invite, magic link, email change, password recovery) and for PKCE codes.
 *
 * The Rhino apps share one Supabase project and one set of email templates,
 * which link to:
 *
 *   {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=<type>
 *
 * {{ .RedirectTo }} is the callback URL the sending app passed, i.e.
 * ${origin}/auth/callback (auth-ui's default). The token travels as a query
 * parameter, so this handler can verify it server-side with verifyOtp and set
 * the session cookies. Unlike a PKCE code, that works when the link is opened
 * on a different device than the one that requested it.
 */

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]

/** Same-origin paths only. Rejects "//host" and "/\host" open redirects. */
function safeNextPath(value: string | null): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith('/\\')
  ) {
    return '/'
  }
  return value
}

function redirectToLogin(origin: string, code: AuthCallbackErrorCode) {
  const url = new URL('/login', origin)
  url.searchParams.set('error', code)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  // Expired or rejected links report themselves with these and no token.
  if (searchParams.has('error')) {
    console.error('Auth callback received an error', {
      error: searchParams.get('error'),
      code: searchParams.get('error_code'),
      description: searchParams.get('error_description'),
    })
    return redirectToLogin(origin, 'link_invalid')
  }

  if (tokenHash && type) {
    if (!EMAIL_OTP_TYPES.includes(type as EmailOtpType)) {
      console.error('Auth callback received an unsupported type', { type })
      return redirectToLogin(origin, 'link_invalid')
    }

    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    })

    if (error) {
      console.error('Auth token verification failed', {
        type,
        code: error.code,
        status: error.status,
        message: error.message,
      })
      return redirectToLogin(origin, 'link_invalid')
    }

    // A recovery session still has to choose a password; any other `next`
    // would strand the user signed in with no way to finish the reset.
    const destination = type === 'recovery' ? '/reset-password' : next
    return NextResponse.redirect(new URL(destination, origin))
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('Auth code exchange failed', {
        code: error.code,
        status: error.status,
        message: error.message,
      })
      return redirectToLogin(origin, 'link_invalid')
    }

    return NextResponse.redirect(new URL(next, origin))
  }

  return redirectToLogin(origin, 'link_incomplete')
}

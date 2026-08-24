import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

/**
 * Only same-origin absolute paths are allowed as a post-login destination.
 *
 * Anything else falls back to "/". Rejecting protocol-relative ("//evil.com")
 * and backslash ("/\evil.com") prefixes matters because browsers normalise them
 * to a different host, and a bare "@evil.com" would be parsed as userinfo when
 * appended to the origin — both are open redirects.
 */
function getSafeNextPath(next: string | null): string {
  if (!next) return '/'

  if (
    !next.startsWith('/') ||
    next.startsWith('//') ||
    next.startsWith('/\\')
  ) {
    return '/'
  }

  return next
}

const VALID_OTP_TYPES: EmailOtpType[] = [
  'invite',
  'signup',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]

async function createSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
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
}

/**
 * Two different flows arrive here.
 *
 * `?code=` is PKCE — OAuth and password sign-in.
 *
 * `?token_hash=&type=` comes from links in auth emails (recovery, invite,
 * signup confirmation). Those must be verified with verifyOtp, not
 * exchangeCodeForSession, and the email template has to build the link with
 * {{ .TokenHash }} as a query param:
 *
 *   {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery
 *
 * The default {{ .ConfirmationURL }} instead returns the session in the URL
 * fragment (#access_token=...), which is never sent to the server, so a route
 * handler cannot read it. Note {{ .RedirectTo }} rather than {{ .SiteURL }}:
 * several apps share this Supabase project and its single Site URL points at a
 * different one.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = getSafeNextPath(searchParams.get('next'))

  // A rejected or expired link reports itself through these, with no code and
  // no token_hash.
  const authError = searchParams.get('error')
  if (authError) {
    console.error('Auth callback returned an error', {
      error: authError,
      code: searchParams.get('error_code'),
      description: searchParams.get('error_description'),
    })
    return NextResponse.redirect(`${origin}/auth/error`)
  }

  if (tokenHash && type) {
    if (!VALID_OTP_TYPES.includes(type as EmailOtpType)) {
      console.error('Auth callback received an unsupported OTP type', { type })
      return NextResponse.redirect(`${origin}/auth/error`)
    }

    const supabase = await createSupabaseClient()
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    })

    if (!error) {
      // Recovery leaves the user holding a session but still needing to choose
      // a password, so it always goes to the reset page — `next` would strand
      // them somewhere they cannot complete the flow.
      const destination = type === 'recovery' ? '/reset-password' : next
      return NextResponse.redirect(new URL(destination, origin))
    }

    console.error('Auth token verification failed', {
      type,
      code: error.code,
      status: error.status,
      message: error.message,
    })
    return NextResponse.redirect(`${origin}/auth/error`)
  }

  if (code) {
    const supabase = await createSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(new URL(next, origin))
    }

    console.error('Auth code exchange failed', {
      code: error.code,
      status: error.status,
      message: error.message,
    })
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}

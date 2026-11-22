// Rhino auth-ui standard constants. Imported by client pages, so keep this
// file free of server-only imports. GUEST_ONLY_PATHS / isOpenAuthPath from the
// standard are omitted: src/proxy.ts only protects /admin and needs neither.

/**
 * Self-signup switch. false: /signup 404s and the login page shows an
 * invitation notice instead of the signup link. Self-signed-up users get no
 * role; the app's authorization must deny them until an admin assigns one.
 */
export const SIGNUP_ENABLED = true

/**
 * Passed to both SignupForm and UpdatePasswordForm. Keep at or above the
 * Supabase project's Auth minimum_password_length, or the form accepts
 * passwords the server rejects.
 */
export const MIN_PASSWORD_LENGTH = 8

/**
 * /auth/callback redirects to /login?error=<code>. The login page shows only
 * these fixed messages, never the raw query value: anyone can craft a
 * /login?error=... link, so echoing it would let them write on our page.
 */
export const AUTH_CALLBACK_ERRORS = {
  link_invalid:
    'That link is invalid or has expired. Request a new one and use the latest email.',
  link_incomplete:
    'That link is incomplete. Open the latest link from your email.',
} as const

export type AuthCallbackErrorCode = keyof typeof AUTH_CALLBACK_ERRORS

export function authCallbackErrorMessage(code: string): string {
  // Object.hasOwn: "toString" and friends must not resolve to prototype members.
  return Object.hasOwn(AUTH_CALLBACK_ERRORS, code)
    ? AUTH_CALLBACK_ERRORS[code as AuthCallbackErrorCode]
    : AUTH_CALLBACK_ERRORS.link_invalid
}

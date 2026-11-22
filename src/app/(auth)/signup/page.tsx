'use client'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SignupForm } from '@rhino-automotive-glass/auth-ui'
import { createClient } from '@/lib/supabase-browser'
import { MIN_PASSWORD_LENGTH, SIGNUP_ENABLED } from '@/lib/auth/constants'

export default function SignupPage() {
  if (!SIGNUP_ENABLED) notFound()

  const supabase = createClient()

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          Create an account
        </h2>
        <p className="text-sm text-slate-600">
          An administrator assigns your role after you sign up
        </p>
      </div>

      {/* No redirectTo: the package default ${origin}/auth/callback is the
          standard callback, and the shared email template appends
          ?token_hash=... to it. */}
      <SignupForm
        supabase={supabase}
        minLength={MIN_PASSWORD_LENGTH}
        className="max-w-none"
      />

      <p className="text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-medium text-blue-600 hover:text-blue-500"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}

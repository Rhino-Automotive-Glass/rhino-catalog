'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UpdatePasswordForm } from '@rhino-automotive-glass/auth-ui'
import { createClient } from '@/lib/supabase-browser'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/constants'

/**
 * Second half of password reset. /auth/callback has verified the recovery
 * token, set the session cookies and redirected here. Without a session
 * (expired, reused or other-browser link) the form shows its invalid-link state.
 */
export default function ResetPasswordPage() {
  const supabase = createClient()
  const router = useRouter()

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          Choose a new password
        </h2>
      </div>

      <UpdatePasswordForm
        supabase={supabase}
        minLength={MIN_PASSWORD_LENGTH}
        onSuccess={() => router.replace('/')}
        className="max-w-none"
      />

      <div className="flex flex-col items-center gap-2 text-sm">
        <Link
          href="/forgot-password"
          className="font-medium text-blue-600 hover:text-blue-500"
        >
          Request a new link
        </Link>
        <Link
          href="/login"
          className="font-medium text-blue-600 hover:text-blue-500"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  )
}

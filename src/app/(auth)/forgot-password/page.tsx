'use client'

import Link from 'next/link'
import { ForgotPasswordForm } from '@rhino-automotive-glass/auth-ui'
import { createClient } from '@/lib/supabase-browser'

export default function ForgotPasswordPage() {
  const supabase = createClient()

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          Reset your password
        </h2>
        <p className="text-sm text-slate-600">
          We&apos;ll email you a link to choose a new one
        </p>
      </div>

      {/* No resetPath and no redirectTo. The shared email template appends
          ?token_hash=...&type=recovery to ${origin}/auth/callback, and the
          callback routes type=recovery to /reset-password. resetPath would add
          ?next=... and break the link. */}
      <ForgotPasswordForm supabase={supabase} className="max-w-none" />

      <Link
        href="/login"
        className="block text-center text-sm font-medium text-blue-600 hover:text-blue-500"
      >
        Back to sign in
      </Link>
    </div>
  )
}

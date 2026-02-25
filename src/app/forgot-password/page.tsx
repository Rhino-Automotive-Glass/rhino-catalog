'use client'

import { createClient } from '@/lib/supabase-browser'
import { ForgotPasswordForm } from '@rhino-automotive-glass/auth-ui'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const supabase = createClient()

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        <h1 className="text-2xl font-bold">Reset password</h1>
        <ForgotPasswordForm supabase={supabase} redirectTo={`${window.location.origin}/auth/callback`} />
        <Link href="/login" className="text-sm text-blue-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    </div>
  )
}

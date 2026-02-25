'use client'

import { createClient } from '@/lib/supabase-browser'
import { SignupForm } from '@rhino-automotive-glass/auth-ui'
import Link from 'next/link'

export default function SignupPage() {
  const supabase = createClient()

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        <h1 className="text-2xl font-bold">Create an account</h1>
        <SignupForm supabase={supabase} redirectTo={`${window.location.origin}/auth/callback`} />
        <p className="text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

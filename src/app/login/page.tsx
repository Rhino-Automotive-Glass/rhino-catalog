'use client'

import { createClient } from '@/lib/supabase-browser'
import { LoginForm } from '@rhino-automotive-glass/auth-ui'
import Link from 'next/link'

export default function LoginPage() {
  const supabase = createClient()

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <LoginForm supabase={supabase} redirectTo="/admin/products" />
        <div className="flex flex-col items-center gap-2 text-sm">
          <Link href="/forgot-password" className="text-blue-600 hover:underline">
            Forgot your password?
          </Link>
          <p className="text-gray-600">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-blue-600 hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

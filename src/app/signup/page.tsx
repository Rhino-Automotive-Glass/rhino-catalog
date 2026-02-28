'use client'

import { createClient } from '@/lib/supabase-browser'
import { AuthLayout, SignupForm } from '@rhino-automotive-glass/auth-ui'
import Link from 'next/link'

export default function SignupPage() {
  const supabase = createClient()

  return (
    <AuthLayout
      backgroundImage="/parabrisas-medallones-van-camioneta-autobuses.webp"
      title="Rhino Catalog"
      subtitle="Create your account"
    >
      <SignupForm supabase={supabase} />
      <p className="text-sm text-slate-600 text-center mt-4">
        Already have an account?{' '}
        <Link href="/login" className="text-blue-600 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}

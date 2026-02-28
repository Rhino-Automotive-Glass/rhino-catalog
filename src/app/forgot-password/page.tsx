'use client'

import { createClient } from '@/lib/supabase-browser'
import { AuthLayout, ForgotPasswordForm } from '@rhino-automotive-glass/auth-ui'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const supabase = createClient()

  return (
    <AuthLayout
      backgroundImage="/parabrisas-medallones-van-camioneta-autobuses.webp"
      title="Rhino Catalog"
      subtitle="Reset your password"
    >
      <ForgotPasswordForm supabase={supabase} />
      <Link href="/login" className="text-sm text-blue-600 hover:underline block text-center mt-4">
        Back to sign in
      </Link>
    </AuthLayout>
  )
}

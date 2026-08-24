'use client'

import { createClient } from '@/lib/supabase-browser'
import { AuthLayout, UpdatePasswordForm } from '@rhino-automotive-glass/auth-ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

/**
 * Second half of the password reset flow. /forgot-password sends the email;
 * this is where the recipient actually sets a new password.
 *
 * Requires the recovery session to already exist, so the auth callback must
 * handle the recovery token before redirecting here.
 */
export default function ResetPasswordPage() {
  const supabase = createClient()
  const router = useRouter()

  return (
    <AuthLayout
      backgroundImage="/parabrisas-medallones-van-camioneta-autobuses.webp"
      title="Rhino Catalog"
      subtitle="Choose a new password"
    >
      <UpdatePasswordForm
        supabase={supabase}
        onSuccess={() => router.push('/')}
      />
      <Link href="/login" className="text-sm text-primary hover:underline block text-center mt-4">
        Back to sign in
      </Link>
    </AuthLayout>
  )
}

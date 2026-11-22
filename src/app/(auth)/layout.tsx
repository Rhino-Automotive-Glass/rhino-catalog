import { AuthLayout } from '@rhino-automotive-glass/auth-ui'

// One AuthLayout for every auth page, so titles and background never drift.
// The image must exist in public/.
export default function AuthRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthLayout
      backgroundImage="/parabrisas-medallones-van-camioneta-autobuses.webp"
      backgroundAlt="Rhino Automotive Glass"
      title="Rhino Catalog"
      subtitle="Product catalog"
    >
      {children}
    </AuthLayout>
  )
}

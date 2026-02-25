export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Authentication error</h1>
        <p className="text-gray-600">Something went wrong during authentication. Please try again.</p>
      </div>
    </div>
  )
}

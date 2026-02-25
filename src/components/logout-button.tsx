'use client'

import { LogOut } from 'lucide-react'

export function LogoutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </form>
  )
}

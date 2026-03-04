import Link from "next/link";
import { BookOpen, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/logout-button";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <Link href="/admin/products" className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <BookOpen className="h-4 w-4 text-white" />
            </div>
            <span className="text-xl font-semibold hidden sm:inline text-gray-900 dark:text-white">Rhino Catalog Admin</span>
          </Link>
          <div className="flex items-center gap-4">
            <nav className="flex gap-1 text-sm">
              <Link href="/catalog" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Catalog</span>
              </Link>
              <Link href="/admin/products" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium bg-cyan-400/10 text-cyan-400 border border-cyan-400/30 shadow-[0_0_10px_rgba(34,211,238,0.35)]">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            </nav>
            <LogoutButton />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
        {children}
      </main>
      <footer className="border-t border-gray-200 dark:border-gray-700 mt-auto">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">Rhino Catalog</p>
        </div>
      </footer>
    </div>
  );
}

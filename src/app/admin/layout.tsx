import Link from "next/link";
import { BookOpen } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/logout-button";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <Link href="/admin/products" className="text-xl font-semibold">
              Rhino Catalog
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <nav className="flex gap-4 text-sm text-muted-foreground">
              <Link href="/admin/products" className="hover:text-foreground transition-colors">
                Products
              </Link>
            </nav>
            <LogoutButton />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {children}
      </main>
      <footer className="border-t border-gray-200 dark:border-gray-700 mt-auto">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 text-sm text-muted-foreground">
          Rhino Catalog
        </div>
      </footer>
    </div>
  );
}

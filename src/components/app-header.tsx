"use client";

import Link from "next/link";
import { BookOpen, Settings, Tags } from "lucide-react";

import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type AppHeaderProps = {
  area: "catalog" | "admin";
  activeAdminSection?: "products" | "groups";
};

function navLinkClass(active = false) {
  return cn(
    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors",
    active
      ? "border border-cyan-400/30 bg-cyan-400/10 font-medium text-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.25)] dark:text-cyan-400"
      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
  );
}

export function AppHeader({ area, activeAdminSection }: AppHeaderProps) {
  const isAdminArea = area === "admin";

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href={isAdminArea ? "/admin/products" : "/catalog"}
          className="order-1 flex min-w-0 shrink-0 items-center gap-3"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
            <BookOpen className="h-4 w-4 text-white" />
          </div>
          <span className="hidden text-lg font-semibold text-gray-900 dark:text-white sm:inline sm:text-xl">
            Rhino Catalog
          </span>
          <span className="text-lg font-semibold text-gray-900 dark:text-white sm:hidden">
            Rhino Catalog
          </span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="order-3 flex w-full min-w-0 items-center gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900/40 sm:order-2 sm:ml-auto sm:w-auto"
        >
          <Link href="/catalog" className={navLinkClass(area === "catalog")}>
            <BookOpen className="h-4 w-4" />
            Catalog
          </Link>
          <Link
            href="/admin/products"
            className={navLinkClass(isAdminArea && activeAdminSection === "products")}
          >
            <Settings className="h-4 w-4" />
            Products
          </Link>
          <Link
            href="/admin/product-groups"
            className={navLinkClass(isAdminArea && activeAdminSection === "groups")}
          >
            <Tags className="h-4 w-4" />
            Groups
          </Link>
        </nav>

        <div className="order-2 ml-auto flex shrink-0 items-center gap-2 sm:order-3 sm:ml-0">
          <LogoutButton />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

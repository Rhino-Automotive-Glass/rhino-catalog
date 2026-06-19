"use client";

import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/app-header";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isProductsActive = pathname.startsWith("/admin/products");
  const isGroupsActive = pathname.startsWith("/admin/product-groups");
  const activeAdminSection = isGroupsActive
    ? "groups"
    : isProductsActive
      ? "products"
      : undefined;

  return (
    <div
      data-admin-root
      className="notranslate min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col"
      translate="no"
    >
      <AppHeader area="admin" activeAdminSection={activeAdminSection} />
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

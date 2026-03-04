"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, ChevronLeft, ChevronRight, Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/logout-button";
import type { ProductWithSource, PaginatedResponse } from "@/lib/types";

const PAGE_SIZE = 40;

export default function CatalogPage() {
  const [products, setProducts] = useState<ProductWithSource[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<string[]>([]);
  const [brandFilter, setBrandFilter] = useState("all");

  // Fetch brands for filter
  useEffect(() => {
    fetch("/api/brands")
      .then((r) => r.json())
      .then((d) => setBrands(d.brands ?? []))
      .catch(() => {});
  }, []);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [brandFilter]);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (brandFilter && brandFilter !== "all") {
      params.set("search", brandFilter);
    }
    try {
      const res = await fetch(`/api/products?${params}`);
      const json: PaginatedResponse<ProductWithSource> = await res.json();
      setProducts(json.data);
      setTotalCount(json.count);
    } catch {
      setProducts([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, brandFilter]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function getProductImage(product: ProductWithSource): string | null {
    const main = product.images?.main;
    if (!main) return null;
    return main.left || main.right || main.back || null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <Link href="/catalog" className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <BookOpen className="h-4 w-4 text-white" />
            </div>
            <span className="text-xl font-semibold hidden sm:inline text-gray-900 dark:text-white">Rhino Catalog Admin</span>
          </Link>
          <div className="flex items-center gap-4">
            <nav className="flex gap-1 text-sm">
              <Link href="/catalog" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium bg-cyan-400/10 text-cyan-400 border border-cyan-400/30 shadow-[0_0_10px_rgba(34,211,238,0.35)]">
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Catalog</span>
              </Link>
              <Link href="/admin/products" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            </nav>
            <LogoutButton />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Product Catalog</h1>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All brands" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All brands</SelectItem>
              {brands.map((brand) => (
                <SelectItem key={brand} value={brand}>
                  {brand}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500 dark:text-gray-400" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex items-center justify-center py-32 text-gray-500 dark:text-gray-400">
            No products found.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((product) => {
              const imageUrl = getProductImage(product);
              return (
                <div key={product.id} className="group cursor-pointer relative aspect-square rounded-xl overflow-hidden bg-neutral-200 dark:bg-neutral-800 transition-all duration-200 hover:ring-2 hover:ring-cyan-400/60 hover:shadow-[0_0_20px_rgba(34,211,238,0.25)]">
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={`${product.brand ?? ""} ${product.model ?? ""}`}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <Image
                      src="/van.webp"
                      alt="No image available"
                      fill
                      className="object-cover dark:invert"
                    />
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-3 space-y-0.5 bg-black/50 backdrop-blur-md border-t border-white/10">
                    {product.brand && (
                      <p className="text-sm font-semibold text-white">{product.brand}</p>
                    )}
                    {product.model && (
                      <p className="text-sm text-white/80">{product.model}</p>
                    )}
                    <p className="text-xs text-white/60 truncate">
                      {product.product_codes?.product_code_data?.generated ?? "—"}
                    </p>
                    <p className="text-xs text-white/50 truncate">
                      {product.product_codes?.description_data?.generated ?? "—"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-700 mt-auto">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">Rhino Catalog</p>
        </div>
      </footer>
    </div>
  );
}

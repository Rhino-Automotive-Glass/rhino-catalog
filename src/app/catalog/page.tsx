"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VanPlaceholder } from "@/components/van-placeholder";
import { ThemeToggle } from "@/components/theme-toggle";
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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-lg">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          <Link href="/catalog" className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <BookOpen className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold hidden sm:inline">Rhino Catalog</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 w-full flex-1">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold">Product Catalog</h1>
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
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex items-center justify-center py-32 text-muted-foreground">
            No products found.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((product) => {
              const imageUrl = getProductImage(product);
              return (
                <div key={product.id} className="group cursor-pointer p-3 rounded-xl transition-colors duration-200 hover:bg-muted/60">
                  <div className={`aspect-video rounded-xl overflow-hidden mb-3 ${imageUrl ? "bg-muted" : "bg-neutral-200 dark:bg-neutral-800"}`}>
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt={`${product.brand ?? ""} ${product.model ?? ""}`}
                        width={640}
                        height={360}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <VanPlaceholder className="w-3/4 h-3/4" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {product.brand && (
                      <p className="text-sm font-semibold text-foreground">{product.brand}</p>
                    )}
                    {product.model && (
                      <p className="text-sm text-muted-foreground">{product.model}</p>
                    )}
                    <p className="text-xs text-muted-foreground truncate">
                      {product.product_codes?.product_code_data?.generated ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground/70 truncate">
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
            <span className="text-sm text-muted-foreground">
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
      <footer className="border-t border-border mt-auto">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 text-sm text-muted-foreground">
          Rhino Catalog
        </div>
      </footer>
    </div>
  );
}

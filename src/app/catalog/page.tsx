"use client";

// This page is entirely client-driven (it fetches brands/products on the client and depends on URL state).
// For deployments that attempt static prerender/export, force dynamic to avoid build-time prerender errors.
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/logout-button";
import type {
  Brand,
  BrandListResponse,
  ProductWithSource,
  PaginatedResponse,
} from "@/lib/types";

const PAGE_SIZE = 40;

const BRAND_LOGOS: Record<string, string> = {
  Changan: "/brands/changan.png",
  Chevrolet: "/brands/chevrolet.png",
  Dongfeng: "/brands/dongfeng.png",
  Ford: "/brands/ford.png",
  Foton: "/brands/foton.png",
  Hyundai: "/brands/hyundai.png",
  JAC: "/brands/jac.png",
  Joylong: "/brands/joylong.png",
  "Mercedes-Benz": "/brands/mercedesbenz.png",
  Peugeot: "/brands/peugeot.png",
  Ram: "/brands/ram.png",
  Renault: "/brands/renault.png",
  Toyota: "/brands/toyota.png",
  Vizeon: "/brands/vizeon.png",
  Volkswagen: "/brands/wolkswagen.png",
};

export default function CatalogPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<ProductWithSource[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  const selectedBrandId = searchParams.get("brand") ?? "";
  const selectedBrand = brands.find((brand) => brand.id === selectedBrandId) ?? null;

  // Fetch catalog brands
  useEffect(() => {
    setBrandsLoading(true);
    fetch("/api/brands?scope=catalog")
      .then(async (r) => {
        const json = (await r.json()) as BrandListResponse & { error?: string };
        if (!r.ok) throw new Error(json.error ?? "Failed to load brands");
        setBrands(Array.isArray(json.brands) ? json.brands : []);
      })
      .catch(() => setBrands([]))
      .finally(() => setBrandsLoading(false));
  }, []);

  // Reset page when brand changes
  useEffect(() => {
    setPage(1);
  }, [selectedBrandId]);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    if (!selectedBrandId) {
      setProducts([]);
      setTotalCount(0);
      setProductsLoading(false);
      return;
    }

    setProductsLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      brandId: selectedBrandId,
    });
    try {
      const res = await fetch(`/api/products?${params}`);
      const json = (await res.json()) as PaginatedResponse<ProductWithSource> & {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(json.error ?? "Failed to load products");
      }

      setProducts(Array.isArray(json.data) ? json.data : []);
      setTotalCount(typeof json.count === "number" ? json.count : 0);
    } catch {
      setProducts([]);
      setTotalCount(0);
    } finally {
      setProductsLoading(false);
    }
  }, [page, selectedBrandId]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function getProductImage(product: ProductWithSource): string | null {
    const main = product.images?.main;
    if (!main) return null;
    return main.left || main.right || main.back || null;
  }

  function getBrandLogo(brandName: string): string | null {
    return BRAND_LOGOS[brandName] ?? null;
  }

  function openBrand(brandId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("brand", brandId);
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearBrand() {
    router.push(pathname);
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
        {!selectedBrandId ? (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Browse Brands</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Select a brand to see every related product in the catalog.
              </p>
            </div>

            {brandsLoading ? (
              <div className="flex items-center justify-center py-32">
                <Loader2 className="h-8 w-8 animate-spin text-gray-500 dark:text-gray-400" />
              </div>
            ) : brands.length === 0 ? (
              <div className="flex items-center justify-center py-32 text-gray-500 dark:text-gray-400">
                No brands found.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {brands.map((brand) => (
                  (() => {
                    const logoSrc = getBrandLogo(brand.name);

                    return (
                  <button
                    key={brand.id}
                    type="button"
                    onClick={() => openBrand(brand.id)}
                    className="group rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-[0_0_22px_rgba(34,211,238,0.18)]"
                  >
                    <div className="flex flex-col items-center">
                      <div className="mb-2 flex h-20 w-full items-center justify-center px-4">
                        {logoSrc ? (
                          <Image
                            src={logoSrc}
                            alt={`${brand.name} logo`}
                            width={192}
                            height={96}
                            className="max-h-full w-auto max-w-full object-contain"
                          />
                        ) : (
                          <BookOpen className="h-5 w-5 text-cyan-600" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold text-gray-900">
                          {brand.name}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          {brand.productCount ?? 0} products
                        </p>
                      </div>
                    </div>
                  </button>
                    );
                  })()
                ))}
              </div>
            )}
          </>
        ) : productsLoading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500 dark:text-gray-400" />
          </div>
        ) : products.length === 0 ? (
          <>
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <Button variant="ghost" size="sm" className="-ml-2 text-gray-600" onClick={clearBrand}>
                  <ArrowLeft className="h-4 w-4" />
                  All brands
                </Button>
                <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {selectedBrand?.name ?? "Selected Brand"}
                </h1>
              </div>
            </div>
            <div className="flex items-center justify-center py-32 text-gray-500 dark:text-gray-400">
              No products found for this brand.
            </div>
          </>
        ) : (
          <>
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <Button variant="ghost" size="sm" className="-ml-2 text-gray-600" onClick={clearBrand}>
                  <ArrowLeft className="h-4 w-4" />
                  All brands
                </Button>
                <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {selectedBrand?.name ?? "Selected Brand"}
                </h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {totalCount} related products
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {products.map((product) => {
                const imageUrl = getProductImage(product);
                return (
                  <div key={product.id} className="group cursor-pointer rounded-xl overflow-hidden bg-white border border-gray-200 transition-all duration-200 hover:ring-2 hover:ring-cyan-400/60 hover:shadow-[0_0_20px_rgba(34,211,238,0.25)]">
                    <div className="relative aspect-[10/7]">
                      {imageUrl ? (
                        <Image
                          src={imageUrl}
                          alt={`${product.primary_brand?.name ?? ""} ${product.model ?? ""}`}
                          fill
                          className="object-contain group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <Image
                          src="/van.png"
                          alt="No image available"
                          fill
                          className="object-contain"
                        />
                      )}
                    </div>
                    <div className="p-3 space-y-0.5 border-t border-gray-200 bg-gray-50">
                      <div className="flex items-center justify-between gap-2">
                        {product.primary_brand && (
                          <p className="text-lg font-semibold text-gray-900">{product.primary_brand.name}</p>
                        )}
                        {product.model && (
                          <p className="text-lg text-gray-600">{product.model}</p>
                        )}
                      </div>
                      <p className="text-base text-gray-500 truncate">
                        {product.product_codes?.product_code_data?.generated ?? "—"}
                      </p>
                      <p className="text-base text-gray-400 truncate">
                        {product.product_codes?.description_data?.generated ?? "—"}
                      </p>
                      {product.additional_brands.length > 0 && (
                        <p className="text-sm text-gray-400 truncate">
                          Also matched to: {product.additional_brands.map((brand) => brand.name).join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Pagination */}
        {selectedBrandId && !productsLoading && totalPages > 1 && (
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

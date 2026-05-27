"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Loader2, Star } from "lucide-react";

import type {
  ProductGroup,
  ProductGroupProduct,
  ProductGroupProductsResponse,
} from "@/lib/types";
import { getCatalogImageSrc } from "@/lib/catalog-image";
import { getProductDisplayName, getProductDisplayYear } from "@/lib/product-display";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function formatYears(group: ProductGroup): string {
  if (!group.year_start && !group.year_end) return "All years";
  if (group.year_start && group.year_end) return `${group.year_start}-${group.year_end}`;
  return String(group.year_start ?? group.year_end);
}

export default function CatalogGroupDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [group, setGroup] = useState<ProductGroup | null>(null);
  const [products, setProducts] = useState<ProductGroupProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadGroup() {
      setLoading(true);

      try {
        const [groupRes, productsRes] = await Promise.all([
          fetch(`/api/product-groups/${encodeURIComponent(slug)}?scope=catalog`),
          fetch(`/api/product-groups/${encodeURIComponent(slug)}/products?scope=catalog`),
        ]);
        const groupJson = (await groupRes.json()) as ProductGroup & { error?: string };
        const productsJson = (await productsRes.json()) as ProductGroupProductsResponse & { error?: string };

        if (!groupRes.ok) throw new Error(groupJson.error ?? "Group not found");
        if (!productsRes.ok) throw new Error(productsJson.error ?? "Products not found");
        if (cancelled) return;

        setGroup(groupJson);
        setProducts(Array.isArray(productsJson.data) ? productsJson.data : []);
      } catch {
        if (!cancelled) {
          setGroup(null);
          setProducts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadGroup();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-900">
      <AppHeader area="catalog" />

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-6 text-gray-600 dark:text-gray-400">
          <Link href="/catalog?tab=vehicle">
            <ArrowLeft className="h-4 w-4" />
            All vehicles
          </Link>
        </Button>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500 dark:text-gray-400" />
          </div>
        ) : !group ? (
          <div className="flex items-center justify-center py-32 text-gray-500 dark:text-gray-400">
            Product group not found.
          </div>
        ) : (
          <>
            <div className="mb-8">
              <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300">
                {group.brand?.name ?? "Any brand"}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal text-gray-900 dark:text-white">
                {group.name}
              </h1>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {[group.sub_model, formatYears(group)].filter(Boolean).join(" / ")}
              </p>
              {group.description && (
                <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600 dark:text-gray-300">
                  {group.description}
                </p>
              )}
            </div>

            <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
              {group.images.map((imageUrl, index) => (
                <div
                  key={imageUrl}
                  className={index === 0 ? "relative aspect-[16/9] overflow-hidden rounded-xl border bg-white md:col-span-2 md:row-span-2" : "relative aspect-[16/9] overflow-hidden rounded-xl border bg-white"}
                >
                  <Image
                    src={getCatalogImageSrc(imageUrl)}
                    alt={`${group.name} image ${index + 1}`}
                    fill
                    className="object-cover p-4"
                    sizes={index === 0 ? "(min-width: 768px) 66vw, 100vw" : "(min-width: 768px) 33vw, 100vw"}
                    priority={index === 0}
                  />
                </div>
              ))}
            </div>

            {products.length === 0 ? (
              <div className="flex items-center justify-center py-32 text-gray-500 dark:text-gray-400">
                No products found in this group.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {products.map((item) => {
                  const product = item.product;
                  const imageUrl = product.images?.[0] ?? null;
                  const displayName = getProductDisplayName(product);
                  const displayYear = getProductDisplayYear(product);

                  return (
                    <article
                      key={product.id}
                      className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:ring-2 hover:ring-cyan-400/60 dark:border-gray-700 dark:bg-gray-800"
                    >
                      <div className="relative aspect-[10/7] bg-white">
                        {imageUrl ? (
                          <Image
                            src={getCatalogImageSrc(imageUrl)}
                            alt={displayName}
                            fill
                            className="object-contain"
                          />
                        ) : (
                          <Image
                            src="/rhino-logo.png"
                            alt="No image available"
                            fill
                            className="object-contain p-6 opacity-35 grayscale"
                          />
                        )}
                      </div>
                      <div className="border-t border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                        <div className="mb-2 flex items-center gap-2">
                          {item.is_featured && (
                            <Badge>
                              <Star className="h-3 w-3" />
                              Featured
                            </Badge>
                          )}
                        </div>
                        <h2 className="line-clamp-2 text-lg font-semibold leading-tight text-gray-900 dark:text-white">
                          {displayName}
                        </h2>
                        {displayYear && (
                          <p className="mt-1 truncate text-sm font-medium text-gray-500 dark:text-gray-400">
                            {displayYear}
                          </p>
                        )}
                        <p className="mt-1 truncate font-mono text-sm text-gray-500 dark:text-gray-400">
                          {product.product_codes?.product_code_data?.generated ?? "—"}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="mt-auto border-t border-gray-200 dark:border-gray-700">
        <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">Rhino Catalog</p>
        </div>
      </footer>
    </div>
  );
}

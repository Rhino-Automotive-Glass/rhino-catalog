"use client";

import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Tags,
  X,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DialogClose,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getCatalogImageSrc } from "@/lib/catalog-image";
import { getProductDisplayName, getProductDisplayYear } from "@/lib/product-display";
import type {
  Brand,
  BrandListResponse,
  PaginatedResponse,
  ProductGroup,
  ProductWithSource,
  SubModelListResponse,
} from "@/lib/types";

const PAGE_SIZE = 40;
const GROUP_PAGE_SIZE = 24;

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
  Nissan: "/brands/nissan.png",
  Peugeot: "/brands/peugeot.png",
  Ram: "/brands/ram.png",
  Renault: "/brands/renault.png",
  Toyota: "/brands/toyota.png",
  Vizeon: "/brands/vizeon.png",
  Volkswagen: "/brands/wolkswagen.png",
};

function formatGroupYears(group: ProductGroup): string {
  if (!group.year_start && !group.year_end) return "All years";
  if (group.year_start && group.year_end) return `${group.year_start}-${group.year_end}`;
  return String(group.year_start ?? group.year_end);
}

export default function CatalogPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<ProductWithSource[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [vehicleGroups, setVehicleGroups] = useState<ProductGroup[]>([]);
  const [vehicleGroupCount, setVehicleGroupCount] = useState(0);
  const [vehicleGroupPage, setVehicleGroupPage] = useState(1);
  const [vehicleGroupsLoading, setVehicleGroupsLoading] = useState(false);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [subModels, setSubModels] = useState<string[]>([]);
  const [subModelsLoading, setSubModelsLoading] = useState(false);
  const [previewProduct, setPreviewProduct] = useState<ProductWithSource | null>(null);
  const selectedBrandId = searchParams.get("brand") ?? "";
  const selectedSubModel = searchParams.get("subModel") ?? "";
  const selectedSearch = searchParams.get("search") ?? "";
  const selectedTab = searchParams.get("tab") === "vehicle" ? "vehicle" : "brand";
  const [searchInput, setSearchInput] = useState(selectedSearch);
  const selectedBrand = brands.find((brand) => brand.id === selectedBrandId) ?? null;
  const hasActiveSearch = selectedSearch.trim().length > 0;
  const isVehicleTab = selectedTab === "vehicle";
  const shouldShowProductResults = selectedTab === "brand" && Boolean(selectedBrandId || hasActiveSearch);
  const previewDisplayName = previewProduct
    ? getProductDisplayName(previewProduct)
    : "No description available";
  const previewDisplayYear = previewProduct ? getProductDisplayYear(previewProduct) : null;

  // Fetch catalog brands
  useEffect(() => {
    fetch("/api/brands?scope=catalog")
      .then(async (r) => {
        const json = (await r.json()) as BrandListResponse & { error?: string };
        if (!r.ok) throw new Error(json.error ?? "Failed to load brands");
        setBrands(Array.isArray(json.brands) ? json.brands : []);
      })
      .catch(() => setBrands([]))
      .finally(() => setBrandsLoading(false));
  }, []);

  useEffect(() => {
    if (selectedTab !== "brand" || !selectedBrandId) {
      setSubModels([]);
      setSubModelsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    queueMicrotask(() => setSubModelsLoading(true));

    fetch(`/api/products/submodels?brandId=${selectedBrandId}`, { signal: controller.signal })
      .then(async (response) => {
        const json = (await response.json()) as SubModelListResponse & { error?: string };

        if (!response.ok) {
          throw new Error(json.error ?? "Failed to load submodels");
        }

        setSubModels(Array.isArray(json.subModels) ? json.subModels : []);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setSubModels([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSubModelsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [selectedBrandId, selectedTab]);

  // Fetch products
  useEffect(() => {
    if (!shouldShowProductResults) {
      setProducts([]);
      setTotalCount(0);
      setProductsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    queueMicrotask(() => setProductsLoading(true));

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      visibility: "visible",
    });

    if (selectedBrandId) {
      params.set("brandId", selectedBrandId);
    }

    if (selectedBrandId && selectedSubModel) {
      params.set("subModel", selectedSubModel);
    }

    if (selectedSearch) {
      params.set("search", selectedSearch);
    }

    fetch(`/api/products?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const json = (await res.json()) as PaginatedResponse<ProductWithSource> & {
          error?: string;
        };

        if (!res.ok) {
          throw new Error(json.error ?? "Failed to load products");
        }

        setProducts(Array.isArray(json.data) ? json.data : []);
        setTotalCount(typeof json.count === "number" ? json.count : 0);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setProducts([]);
        setTotalCount(0);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setProductsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [page, selectedBrandId, selectedSearch, selectedSubModel, shouldShowProductResults]);

  useEffect(() => {
    if (!isVehicleTab) {
      setVehicleGroupsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    queueMicrotask(() => setVehicleGroupsLoading(true));

    fetch(
      `/api/product-groups?scope=catalog&page=${vehicleGroupPage}&pageSize=${GROUP_PAGE_SIZE}`,
      { signal: controller.signal }
    )
      .then(async (res) => {
        const json = (await res.json()) as PaginatedResponse<ProductGroup> & {
          error?: string;
        };

        if (!res.ok) throw new Error(json.error ?? "Failed to load vehicle groups");

        setVehicleGroups(Array.isArray(json.data) ? json.data : []);
        setVehicleGroupCount(typeof json.count === "number" ? json.count : 0);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;

        setVehicleGroups([]);
        setVehicleGroupCount(0);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setVehicleGroupsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [isVehicleTab, vehicleGroupPage]);

  useEffect(() => {
    setSearchInput(selectedSearch);
  }, [selectedSearch]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const vehicleGroupPages = Math.max(1, Math.ceil(vehicleGroupCount / GROUP_PAGE_SIZE));

  function getProductImage(product: ProductWithSource): string | null {
    return product.images?.[0] ?? null;
  }

  function getBrandLogo(brandName: string): string | null {
    return BRAND_LOGOS[brandName] ?? null;
  }

  function openBrand(brandId: string) {
    setPage(1);
    setProducts([]);
    setTotalCount(0);
    setProductsLoading(true);
    setSubModels([]);
    setSubModelsLoading(true);

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "brand");
    params.set("brand", brandId);
    params.delete("subModel");
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearBrand() {
    setPage(1);
    setProducts([]);
    setTotalCount(0);
    setProductsLoading(false);
    setSubModels([]);
    setSubModelsLoading(false);

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "brand");
    params.delete("brand");
    params.delete("subModel");

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function updateSubModelFilter(nextSubModel: string) {
    setPage(1);
    setProducts([]);
    setTotalCount(0);
    setProductsLoading(true);

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "brand");

    if (nextSubModel) {
      params.set("subModel", nextSubModel);
    } else {
      params.delete("subModel");
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const updateSearchFilter = useEffectEvent((nextSearch: string) => {
    if (selectedTab !== "brand") return;

    setPage(1);
    setProducts([]);
    setTotalCount(0);
    setProductsLoading(true);

    const params = new URLSearchParams(searchParams.toString());

    if (nextSearch) {
      params.set("search", nextSearch);
    } else {
      params.delete("search");
    }

    if (!selectedBrandId) {
      params.delete("subModel");
    }

    const query = params.toString();

    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  });

  function setCatalogTab(tab: "brand" | "vehicle") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);

    if (tab === "vehicle") {
      params.delete("brand");
      params.delete("subModel");
      params.delete("search");
      setSearchInput("");
      setPage(1);
      setProducts([]);
      setTotalCount(0);
      setVehicleGroupPage(1);
    }

    if (tab === "brand") {
      setVehicleGroupPage(1);
    }

    router.push(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    const normalizedSearchInput = searchInput.trim();
    const normalizedSelectedSearch = selectedSearch.trim();

    if (normalizedSearchInput === normalizedSelectedSearch) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      updateSearchFilter(normalizedSearchInput);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput, selectedSearch]);

  const searchHelperText = hasActiveSearch
    ? selectedBrandId
      ? `Showing results for "${selectedSearch}" in ${selectedBrand?.name ?? "this brand"}.`
      : `Showing results for "${selectedSearch}" across all brands.`
    : "Use the product code, description, model, or submodel to find a part faster.";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      <AppHeader area="catalog" />

      {/* Main content */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
        <div className="mb-8 flex justify-center">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => setCatalogTab("brand")}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                selectedTab === "brand"
                  ? "bg-cyan-400/10 text-cyan-700 dark:text-cyan-300"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
              }`}
              aria-pressed={selectedTab === "brand"}
            >
              <BookOpen className="h-4 w-4" />
              Brand
            </button>
            <button
              type="button"
              onClick={() => setCatalogTab("vehicle")}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                selectedTab === "vehicle"
                  ? "bg-cyan-400/10 text-cyan-700 dark:text-cyan-300"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
              }`}
              aria-pressed={selectedTab === "vehicle"}
            >
              <Tags className="h-4 w-4" />
              Vehicle
            </button>
          </div>
        </div>

        {isVehicleTab ? (
          <div className="mb-8 text-center">
            <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
              Browse Vehicles
            </h1>
          </div>
        ) : selectedBrandId ? (
          <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <Button variant="ghost" size="sm" className="-ml-2 text-gray-600" onClick={clearBrand}>
                <ArrowLeft className="h-4 w-4" />
                All brands
              </Button>
              <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                {selectedBrand?.name ?? "Browse Brands"}
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {totalCount} {hasActiveSearch ? "matching products" : "related products"}
              </p>
            </div>

            <div className="w-full xl:max-w-3xl">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div>
                  <div className="relative">
                    <label
                      htmlFor="catalog-product-search"
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Search products
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
                      <Input
                        id="catalog-product-search"
                        type="text"
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        placeholder="Search by code, description, model, or submodel"
                        className="h-12 border-gray-200 bg-white pl-10 pr-11 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-800"
                      />
                      {searchInput && (
                        <button
                          type="button"
                          onClick={() => setSearchInput("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                          aria-label="Clear product search"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {searchHelperText}
                    </p>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="catalog-submodel-filter"
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Filter by submodel
                  </label>
                  <div className="relative">
                    <select
                      id="catalog-submodel-filter"
                      value={selectedSubModel}
                      onChange={(event) => updateSubModelFilter(event.target.value)}
                      disabled={subModelsLoading}
                      className="w-full appearance-none rounded-lg border border-gray-200 bg-white px-4 py-3 pr-11 text-sm text-gray-900 shadow-sm transition-colors focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200 disabled:cursor-wait disabled:opacity-70 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    >
                      <option value="">All submodels</option>
                      {subModels.map((subModel) => (
                        <option key={subModel} value={subModel}>
                          {subModel}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {subModelsLoading
                      ? "Loading submodels..."
                      : `${subModels.length} submodels available`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-8">
            <div className="text-center">
              <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                {hasActiveSearch ? "Search Products" : "Browse Brands"}
              </h1>
              {/* <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {hasActiveSearch
                  ? `${totalCount} matching products across all brands`
                  : "Select a brand to see every related product in the catalog."}
              </p> */}
            </div>

            <div className="mx-auto mt-6 w-full max-w-2xl">
              {/* <label
                htmlFor="catalog-product-search"
                className="mb-2 block text-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Search products
              </label> */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
                <Input
                  id="catalog-product-search"
                  type="text"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search by code, description, model, or submodel"
                  className="h-12 border-gray-200 bg-white pl-10 pr-11 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-800"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                    aria-label="Clear product search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
                {searchHelperText}
              </p>
            </div>
          </div>
        )}

        {isVehicleTab ? (
          <>
            {vehicleGroupsLoading ? (
              <div className="flex items-center justify-center py-32">
                <Loader2 className="h-8 w-8 animate-spin text-gray-500 dark:text-gray-400" />
              </div>
            ) : vehicleGroups.length === 0 ? (
              <div className="flex items-center justify-center py-32 text-gray-500 dark:text-gray-400">
                No published vehicle groups found.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {vehicleGroups.map((group, index) => (
                  <Link
                    key={group.id}
                    href={`/catalog/groups/${group.slug}`}
                    className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-[0_0_22px_rgba(34,211,238,0.18)] dark:border-gray-700 dark:bg-gray-800"
                  >
                    <div className="relative aspect-[16/9] bg-white dark:bg-gray-900">
                      <Image
                        src={getCatalogImageSrc(group.images[0])}
                        alt={group.name}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105 p-4"
                        sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        priority={index === 0}
                      />
                    </div>
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-cyan-700 dark:text-cyan-300">
                            {group.brand?.name ?? "Any brand"}
                          </p>
                          <h2 className="mt-2 line-clamp-2 text-xl font-semibold leading-tight text-gray-900 dark:text-white">
                            {group.name}
                          </h2>
                        </div>
                        <Tags className="mt-1 h-5 w-5 shrink-0 text-gray-400 transition-colors group-hover:text-cyan-500" />
                      </div>
                      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                        {[group.sub_model, formatGroupYears(group)].filter(Boolean).join(" / ")}
                      </p>
                      {group.description && (
                        <p className="mt-3 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
                          {group.description}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : !shouldShowProductResults ? (
          <>
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
        ) : (
          <>
            {productsLoading ? (
              <div className="flex items-center justify-center py-32">
                <Loader2 className="h-8 w-8 animate-spin text-gray-500 dark:text-gray-400" />
              </div>
            ) : products.length === 0 ? (
              <div className="flex items-center justify-center py-32 text-gray-500 dark:text-gray-400">
                {hasActiveSearch
                  ? `No products found for "${selectedSearch}".`
                  : "No products found for this brand."}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {products.map((product) => {
                  const imageUrl = getProductImage(product);
                  const displayName = getProductDisplayName(product);
                  const displayYear = getProductDisplayYear(product);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => setPreviewProduct(product)}
                      className="group overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition-all duration-200 hover:ring-2 hover:ring-cyan-400/60 hover:shadow-[0_0_20px_rgba(34,211,238,0.25)]"
                    >
                      <div className="relative aspect-[10/7]">
                        {imageUrl ? (
                          <Image
                            src={getCatalogImageSrc(imageUrl)}
                            alt={displayName}
                            fill
                            className="object-contain group-hover:scale-105 transition-transform duration-300"
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
                      <div className="space-y-0.5 border-t border-gray-200 bg-gray-50 p-3">
                        {!selectedBrandId && product.primary_brand?.name && (
                          <p className="truncate text-xs font-medium text-cyan-700 dark:text-cyan-300">
                            {product.primary_brand.name}
                          </p>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <p className="line-clamp-2 text-lg font-semibold leading-tight text-gray-900">
                            {displayName}
                          </p>
                        </div>
                        {displayYear && (
                          <p className="truncate text-sm font-medium text-gray-500">
                            {displayYear}
                          </p>
                        )}
                        <p className="truncate text-base text-gray-500">
                          {product.product_codes?.product_code_data?.generated ?? "—"}
                        </p>
                        {/* <p className="truncate text-base text-gray-400">
                          {product.product_codes?.description_data?.generated ?? "—"}
                        </p> */}
                        {product.additional_brands.length > 0 && (
                          <p className="truncate text-sm text-gray-400">
                            Also matched to: {product.additional_brands.map((brand) => brand.name).join(", ")}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Pagination */}
        {shouldShowProductResults && !productsLoading && totalPages > 1 && (
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

        {isVehicleTab && !vehicleGroupsLoading && vehicleGroupPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVehicleGroupPage((current) => Math.max(1, current - 1))}
              disabled={vehicleGroupPage <= 1}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Page {vehicleGroupPage} of {vehicleGroupPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVehicleGroupPage((current) => Math.min(vehicleGroupPages, current + 1))}
              disabled={vehicleGroupPage >= vehicleGroupPages}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}
      </main>

      <Dialog
        open={Boolean(previewProduct)}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewProduct(null);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-w-6xl overflow-hidden border-gray-200 p-0"
        >
          {previewProduct && (
            <>
              <DialogClose asChild>
                <button
                  type="button"
                  className="absolute top-4 right-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-900/80 text-white shadow-sm transition-colors hover:bg-gray-900"
                  aria-label="Close image preview"
                >
                  <X className="h-5 w-5" />
                </button>
              </DialogClose>

              <DialogHeader className="border-b border-gray-200 bg-white px-6 py-4 pr-16 text-left">
                <DialogTitle className="line-clamp-2 text-xl leading-tight text-gray-900">
                  {previewDisplayName}
                </DialogTitle>
                {previewDisplayYear && (
                  <p className="mt-1 text-sm font-medium text-gray-600">
                    {previewDisplayYear}
                  </p>
                )}
                <DialogDescription className="truncate text-sm text-gray-500">
                  {previewProduct.product_codes?.product_code_data?.generated ?? "—"}
                </DialogDescription>
              </DialogHeader>
              <div className="bg-gray-100 p-2 sm:p-3">
                <div className="relative h-[72vh] min-h-[420px] overflow-hidden rounded-lg bg-white">
                  {getProductImage(previewProduct) ? (
                    <Image
                      src={getCatalogImageSrc(getProductImage(previewProduct))}
                      alt={previewDisplayName}
                      fill
                      className="object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Image
                        src="/rhino-logo.png"
                        alt="No image available"
                        fill
                        className="object-contain p-8 opacity-35 grayscale"
                      />
                    </div>
                  )}
                </div>
                <div className="mt-4 space-y-1 text-sm text-gray-600">
                  {previewProduct.additional_brands.length > 0 && (
                    <p className="truncate text-gray-500">
                      Also matched to: {previewProduct.additional_brands.map((brand) => brand.name).join(", ")}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-700 mt-auto">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">Rhino Catalog</p>
        </div>
      </footer>
    </div>
  );
}

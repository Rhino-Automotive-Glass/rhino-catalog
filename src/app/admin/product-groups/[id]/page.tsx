"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Plus,
  Save,
  Search,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";

import type {
  Brand,
  BrandListResponse,
  PaginatedResponse,
  ProductGroup,
  ProductGroupProduct,
  ProductGroupProductsResponse,
  ProductGroupSuggestion,
  ProductWithSource,
  SubModelListResponse,
} from "@/lib/types";
import { productGroupFormSchema, type ProductGroupFormValues } from "@/lib/schemas";
import { getApiErrorDescription, logAdminActionError, readApiError } from "@/lib/api-error";
import { getProductDisplayName, getProductDisplayYear } from "@/lib/product-display";
import { deleteImage } from "@/lib/upload";
import { stripLeadingBrand } from "@/lib/product-group-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MultiImageUpload } from "@/components/image-upload";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ApiList<T> = { data: T[]; count: number; error?: string };
const PRODUCT_PICKER_PAGE_SIZE = 20;

const productStatusColors: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  published: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  archived: "bg-gray-100 text-gray-800 dark:bg-gray-700/40 dark:text-gray-300",
  hidden: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const defaultValues: ProductGroupFormValues = {
  slug: "",
  name: "",
  description: null,
  images: [],
  brand_id: null,
  model: null,
  sub_model: null,
  year_start: null,
  year_end: null,
  status: "published",
  sort_order: 0,
};

function toFormValues(group: ProductGroup): ProductGroupFormValues {
  return {
    slug: group.slug,
    name: group.name,
    description: group.description,
    images: Array.isArray(group.images) ? group.images.slice(0, 3) : [],
    brand_id: group.brand_id,
    model: group.model,
    sub_model: group.sub_model,
    year_start: group.year_start,
    year_end: group.year_end,
    status: group.status,
    sort_order: group.sort_order,
  };
}

function buildSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function buildGroupSlug(
  values: Pick<
    ProductGroupFormValues,
    "name" | "sub_model" | "year_start" | "year_end"
  >,
  brand: Brand | null
): string {
  const years =
    values.year_start && values.year_end
      ? `${values.year_start}-${values.year_end}`
      : values.year_start ?? values.year_end ?? "";
  const brandName = brand?.name ?? "";
  const vehicleSlug = buildSlug(
    [brandName, stripLeadingBrand(values.sub_model ?? values.name, brandName), years]
      .filter(Boolean)
      .join(" ")
  );

  return vehicleSlug || buildSlug(values.name);
}

function productCode(product: ProductWithSource): string {
  return product.product_codes?.product_code_data?.generated ?? "—";
}

function ProductSummary({ product }: { product: ProductWithSource }) {
  const displayName = getProductDisplayName(product);
  const displayYear = getProductDisplayYear(product);

  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-foreground">{displayName}</p>
      <p className="truncate font-mono text-xs text-muted-foreground">{productCode(product)}</p>
      <p className="truncate text-xs text-muted-foreground">
        {[product.primary_brand?.name, product.model, product.subModel, displayYear]
          .filter(Boolean)
          .join(" / ")}
      </p>
    </div>
  );
}

export default function EditProductGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const isNew = id === "new";
  const router = useRouter();
  const [group, setGroup] = useState<ProductGroup | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [primaryBrands, setPrimaryBrands] = useState<Brand[]>([]);
  const [groupProducts, setGroupProducts] = useState<ProductGroupProduct[]>([]);
  const [suggestions, setSuggestions] = useState<ProductGroupSuggestion[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionAddPending, setSuggestionAddPending] = useState(false);
  const [pendingImageDeletionUrls, setPendingImageDeletionUrls] = useState<string[]>([]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [pickerProducts, setPickerProducts] = useState<ProductWithSource[]>([]);
  const [pickerRowCount, setPickerRowCount] = useState(0);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerPrimaryBrandFilter, setPickerPrimaryBrandFilter] = useState("all");
  const [pickerStatusFilter, setPickerStatusFilter] = useState("all");
  const [pickerSubModelFilter, setPickerSubModelFilter] = useState("all");
  const [pickerSubModels, setPickerSubModels] = useState<string[]>([]);
  const [pickerSubModelsLoading, setPickerSubModelsLoading] = useState(false);
  const [pickerPage, setPickerPage] = useState(1);
  const [selectedProducts, setSelectedProducts] = useState<Map<string, ProductWithSource>>(
    () => new Map()
  );

  const form = useForm<ProductGroupFormValues>({
    resolver: zodResolver(productGroupFormSchema),
    defaultValues,
  });

  const selectedBrandId = form.watch("brand_id");
  const groupImages = form.watch("images");
  const groupName = form.watch("name");
  const groupSubModel = form.watch("sub_model");
  const groupYearStart = form.watch("year_start");
  const groupYearEnd = form.watch("year_end");
  const selectedBrand = brands.find((brand) => brand.id === selectedBrandId) ?? null;
  const autoSlug = useMemo(
    () =>
      buildGroupSlug(
        {
          name: groupName,
          sub_model: groupSubModel,
          year_start: groupYearStart,
          year_end: groupYearEnd,
        },
        selectedBrand
      ),
    [groupName, groupSubModel, groupYearEnd, groupYearStart, selectedBrand]
  );
  const uploadFolder = `product-groups/${autoSlug || group?.slug || id}`;
  const existingProductIds = useMemo(
    () => new Set(groupProducts.map((item) => item.product_id)),
    [groupProducts]
  );
  const pickerPageCount = Math.max(1, Math.ceil(pickerRowCount / PRODUCT_PICKER_PAGE_SIZE));
  const selectedProductCount = selectedProducts.size;
  const slugFieldsDirty = Boolean(
    form.formState.dirtyFields.name ||
      form.formState.dirtyFields.brand_id ||
      form.formState.dirtyFields.sub_model ||
      form.formState.dirtyFields.year_start ||
      form.formState.dirtyFields.year_end
  );

  const fetchGroup = useCallback(async () => {
    if (isNew) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/product-groups/${encodeURIComponent(id)}`);
      if (!res.ok) throw await readApiError(res, "Group not found");
      const json = (await res.json()) as ProductGroup & { error?: string };
      setGroup(json);
      setPendingImageDeletionUrls([]);
      form.reset(toFormValues(json));
    } catch (error) {
      logAdminActionError("Failed to load product group in admin", error, { groupId: id });
      toast.error("Failed to load product group", {
        description: getApiErrorDescription(error, "Unknown error"),
      });
    } finally {
      setLoading(false);
    }
  }, [form, id, isNew]);

  const fetchGroupProducts = useCallback(async () => {
    if (isNew) return;

    setProductsLoading(true);
    try {
      const res = await fetch(`/api/product-groups/${encodeURIComponent(id)}/products`);
      if (!res.ok) throw await readApiError(res, "Failed to load group products");
      const json = (await res.json()) as ProductGroupProductsResponse & { error?: string };
      setGroupProducts(Array.isArray(json.data) ? json.data : []);
    } catch (error) {
      logAdminActionError("Failed to load product group products in admin", error, {
        groupId: id,
      });
      toast.error("Failed to load group products", {
        description: getApiErrorDescription(error, "Unknown error"),
      });
    } finally {
      setProductsLoading(false);
    }
  }, [id, isNew]);

  const fetchSuggestions = useCallback(async () => {
    if (isNew) return;

    setSuggestionsLoading(true);
    try {
      const res = await fetch(`/api/product-groups/${encodeURIComponent(id)}/suggestions`);
      if (!res.ok) throw await readApiError(res, "Failed to load suggestions");
      const json = (await res.json()) as ApiList<ProductGroupSuggestion>;
      setSuggestions(Array.isArray(json.data) ? json.data : []);
    } catch (error) {
      logAdminActionError("Failed to load product group suggestions in admin", error, {
        groupId: id,
      });
      toast.error("Failed to load suggestions", {
        description: getApiErrorDescription(error, "Unknown error"),
      });
    } finally {
      setSuggestionsLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    fetch("/api/brands")
      .then(async (res) => {
        if (!res.ok) throw await readApiError(res, "Failed to load brands");
        const json = (await res.json()) as BrandListResponse & { error?: string };
        setBrands(Array.isArray(json.brands) ? json.brands : []);
      })
      .catch((error: unknown) => {
        logAdminActionError("Failed to load product group brands", error);
        toast.error("Failed to load brands", {
          description: getApiErrorDescription(error, "Unknown error"),
        });
      });
  }, []);

  useEffect(() => {
    fetch("/api/brands?scope=primary")
      .then(async (res) => {
        if (!res.ok) throw await readApiError(res, "Failed to load primary brands");
        const json = (await res.json()) as BrandListResponse & { error?: string };
        setPrimaryBrands(Array.isArray(json.brands) ? json.brands : []);
      })
      .catch((error: unknown) => {
        logAdminActionError("Failed to load product picker brand filters", error);
        toast.error("Failed to load product brand filters", {
          description: getApiErrorDescription(error, "Unknown error"),
        });
      });
  }, []);

  useEffect(() => {
    if (
      pickerPrimaryBrandFilter !== "all" &&
      primaryBrands.length > 0 &&
      !primaryBrands.some((brand) => brand.id === pickerPrimaryBrandFilter)
    ) {
      setPickerPrimaryBrandFilter("all");
      setPickerSubModelFilter("all");
      setPickerSubModels([]);
      setPickerPage(1);
    }
  }, [pickerPrimaryBrandFilter, primaryBrands]);

  useEffect(() => {
    if (!autoSlug) return;
    if (!isNew && !slugFieldsDirty) return;

    const currentSlug = form.getValues("slug");
    if (currentSlug === autoSlug) return;

    form.setValue("slug", autoSlug, {
      shouldDirty: currentSlug.length > 0,
      shouldValidate: true,
    });
  }, [autoSlug, form, isNew, slugFieldsDirty]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  useEffect(() => {
    fetchGroupProducts();
    fetchSuggestions();
  }, [fetchGroupProducts, fetchSuggestions]);

  const fetchPickerProducts = useCallback(
    async (signal?: AbortSignal) => {
      if (!productPickerOpen) return;

      setPickerLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(pickerPage),
          pageSize: String(PRODUCT_PICKER_PAGE_SIZE),
          visibility: "all",
        });

        if (pickerSearch.trim()) params.set("search", pickerSearch.trim());
        if (pickerPrimaryBrandFilter !== "all") {
          params.set("primaryBrandId", pickerPrimaryBrandFilter);
        }
        if (pickerStatusFilter !== "all") params.set("status", pickerStatusFilter);
        if (pickerSubModelFilter !== "all") params.set("subModel", pickerSubModelFilter);

        const res = await fetch(`/api/products?${params}`, { signal });
        if (!res.ok) throw await readApiError(res, "Failed to load products");
        const json = (await res.json()) as PaginatedResponse<ProductWithSource> & {
          error?: string;
        };

        setPickerProducts(Array.isArray(json.data) ? json.data : []);
        setPickerRowCount(typeof json.count === "number" ? json.count : 0);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;

        setPickerProducts([]);
        setPickerRowCount(0);
        logAdminActionError("Failed to load product picker products", error, {
          groupId: id,
          pickerPrimaryBrandFilter,
          pickerSearch,
          pickerStatusFilter,
          pickerSubModelFilter,
        });
        toast.error("Failed to load products", {
          description: getApiErrorDescription(error, "Unknown error"),
        });
      } finally {
        if (!signal?.aborted) setPickerLoading(false);
      }
    },
    [
      id,
      pickerPage,
      pickerPrimaryBrandFilter,
      pickerSearch,
      pickerStatusFilter,
      pickerSubModelFilter,
      productPickerOpen,
    ]
  );

  useEffect(() => {
    if (!productPickerOpen) return undefined;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      fetchPickerProducts(controller.signal);
    }, 200);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [fetchPickerProducts, productPickerOpen]);

  useEffect(() => {
    if (!productPickerOpen || pickerPrimaryBrandFilter === "all") {
      setPickerSubModels([]);
      setPickerSubModelsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    queueMicrotask(() => setPickerSubModelsLoading(true));

    fetch(`/api/products/submodels?primaryBrandId=${pickerPrimaryBrandFilter}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw await readApiError(res, "Failed to load submodels");
        const json = (await res.json()) as SubModelListResponse & { error?: string };
        setPickerSubModels(Array.isArray(json.subModels) ? json.subModels : []);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        logAdminActionError("Failed to load product picker submodels", error, {
          pickerPrimaryBrandFilter,
        });
        setPickerSubModels([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPickerSubModelsLoading(false);
      });

    return () => controller.abort();
  }, [pickerPrimaryBrandFilter, productPickerOpen]);

  const queueImageDeletion = useCallback((url: string) => {
    setPendingImageDeletionUrls((current) =>
      current.includes(url) ? current : [...current, url]
    );
  }, []);

  function resetPickerPage() {
    setPickerPage(1);
  }

  function handlePickerBrandChange(value: string) {
    setPickerPrimaryBrandFilter(value);
    setPickerSubModelFilter("all");
    setPickerSubModels([]);
    resetPickerPage();
  }

  function handlePickerStatusChange(value: string) {
    setPickerStatusFilter(value);
    resetPickerPage();
  }

  function handlePickerSearchChange(value: string) {
    setPickerSearch(value);
    resetPickerPage();
  }

  function handlePickerSubModelChange(value: string) {
    setPickerSubModelFilter(value);
    resetPickerPage();
  }

  function togglePickerProduct(product: ProductWithSource) {
    if (existingProductIds.has(product.id)) return;

    setSelectedProducts((current) => {
      const next = new Map(current);

      if (next.has(product.id)) {
        next.delete(product.id);
      } else {
        next.set(product.id, product);
      }

      return next;
    });
  }

  function clearPickerSelection() {
    setSelectedProducts(new Map());
  }

  async function attachProductsToSavedGroup(groupId: string, products: ProductGroupProduct[]) {
    await Promise.all(
      products.map(async (item, index) => {
        const res = await fetch(`/api/product-groups/${encodeURIComponent(groupId)}/products`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: item.product_id,
            sort_order: index,
            is_featured: item.is_featured,
          }),
        });
        if (!res.ok) throw await readApiError(res, "Failed to add selected products");
      })
    );
  }

  async function onSubmit(values: ProductGroupFormValues) {
    setSaving(true);

    try {
      const productsToAttach = isNew ? groupProducts : [];
      const payload = {
        ...values,
        model: null,
        slug: isNew || slugFieldsDirty ? autoSlug || values.slug : values.slug,
      };
      const res = await fetch(isNew ? "/api/product-groups" : `/api/product-groups/${encodeURIComponent(id)}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw await readApiError(res, "Save failed");
      const json = (await res.json()) as ProductGroup & { error?: string };

      const savedValues = toFormValues(json);
      const cleanupUrls = pendingImageDeletionUrls.filter(
        (url) => !savedValues.images.includes(url)
      );

      await Promise.all(
        cleanupUrls.map(async (url) => {
          try {
            await deleteImage(url);
          } catch (error) {
            logAdminActionError("Failed to delete superseded group image", error, {
              message: error instanceof Error ? error.message : "Unknown error",
              groupId: json.id,
              url,
            });
          }
        })
      );

      setPendingImageDeletionUrls([]);
      setGroup(json);
      form.reset(savedValues);

      if (productsToAttach.length > 0) {
        await attachProductsToSavedGroup(json.id, productsToAttach);
      }

      toast.success("Product group saved");

      if (isNew) {
        router.replace(`/admin/product-groups/${json.id}`);
      } else {
        router.refresh();
      }
    } catch (error) {
      logAdminActionError("Failed to save product group in admin", error, { groupId: id });
      toast.error("Failed to save product group", {
        description: getApiErrorDescription(error, "Unknown error"),
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteGroup() {
    if (!group || !window.confirm(`Delete "${group.name}"?`)) return;

    try {
      const res = await fetch(`/api/product-groups/${encodeURIComponent(group.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw await readApiError(res, "Delete failed");
      await Promise.all(
        group.images.map((url) =>
          deleteImage(url).catch((error) => {
            logAdminActionError("Failed to delete product group image after group delete", error, {
              message: error instanceof Error ? error.message : "Unknown error",
              groupId: group.id,
              url,
            });
          })
        )
      );
      toast.success("Product group deleted");
      router.push("/admin/product-groups");
    } catch (error) {
      logAdminActionError("Failed to delete product group in admin", error, {
        groupId: group.id,
      });
      toast.error("Failed to delete product group", {
        description: getApiErrorDescription(error, "Unknown error"),
      });
    }
  }

  async function addProduct(product: ProductWithSource) {
    if (isNew) {
      if (existingProductIds.has(product.id)) return;

      setGroupProducts((items) => [
        ...items,
        {
          group_id: "",
          product_id: product.id,
          sort_order: items.length,
          is_featured: false,
          created_at: new Date().toISOString(),
          product,
        },
      ]);
      return;
    }

    try {
      const res = await fetch(`/api/product-groups/${encodeURIComponent(id)}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          sort_order: groupProducts.length,
          is_featured: false,
        }),
      });
      if (!res.ok) throw await readApiError(res, "Failed to add product");
      toast.success("Product added");
      await fetchGroupProducts();
      await fetchSuggestions();
    } catch (error) {
      logAdminActionError("Failed to add product to group in admin", error, {
        groupId: id,
        productId: product.id,
      });
      toast.error("Failed to add product", {
        description: getApiErrorDescription(error, "Unknown error"),
      });
    }
  }

  async function addSuggestionProduct(product: ProductWithSource) {
    if (suggestionAddPending) return;

    setSuggestionAddPending(true);
    try {
      await addProduct(product);
    } finally {
      setSuggestionAddPending(false);
    }
  }

  async function addSelectedProducts() {
    const products = Array.from(selectedProducts.values()).filter(
      (product) => !existingProductIds.has(product.id)
    );

    if (products.length === 0) {
      toast.error("Select at least one available product");
      return;
    }

    try {
      if (isNew) {
        setGroupProducts((items) => [
          ...items,
          ...products.map((product, index) => ({
            group_id: "",
            product_id: product.id,
            sort_order: items.length + index,
            is_featured: false,
            created_at: new Date().toISOString(),
            product,
          })),
        ]);
      } else {
        await Promise.all(
          products.map(async (product, index) => {
            const res = await fetch(`/api/product-groups/${encodeURIComponent(id)}/products`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                product_id: product.id,
                sort_order: groupProducts.length + index,
                is_featured: false,
              }),
            });
            if (!res.ok) throw await readApiError(res, "Failed to add selected products");
          })
        );
        await fetchGroupProducts();
        await fetchSuggestions();
      }

      clearPickerSelection();
      setProductPickerOpen(false);
      toast.success(`${products.length} product${products.length === 1 ? "" : "s"} added`);
    } catch (error) {
      logAdminActionError("Failed to add selected products to group in admin", error, {
        groupId: id,
        selectedProductIds: products.map((product) => product.id),
      });
      toast.error("Failed to add selected products", {
        description: getApiErrorDescription(error, "Unknown error"),
      });
    }
  }

  async function removeProduct(productId: string) {
    if (isNew) {
      setGroupProducts((items) =>
        items
          .filter((item) => item.product_id !== productId)
          .map((item, sort_order) => ({ ...item, sort_order }))
      );
      return;
    }

    try {
      const res = await fetch(
        `/api/product-groups/${encodeURIComponent(id)}/products?productId=${encodeURIComponent(productId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw await readApiError(res, "Failed to remove product");
      toast.success("Product removed");
      await fetchGroupProducts();
      await fetchSuggestions();
    } catch (error) {
      logAdminActionError("Failed to remove product from group in admin", error, {
        groupId: id,
        productId,
      });
      toast.error("Failed to remove product", {
        description: getApiErrorDescription(error, "Unknown error"),
      });
    }
  }

  async function updateProduct(productId: string, patch: { is_featured?: boolean; sort_order?: number }) {
    const res = await fetch(`/api/product-groups/${encodeURIComponent(id)}/products`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, ...patch }),
    });
    if (!res.ok) throw await readApiError(res, "Update failed");
  }

  async function toggleFeatured(item: ProductGroupProduct) {
    if (isNew) {
      setGroupProducts((items) =>
        items.map((current) =>
          current.product_id === item.product_id
            ? { ...current, is_featured: !current.is_featured }
            : current
        )
      );
      return;
    }

    try {
      await updateProduct(item.product_id, { is_featured: !item.is_featured });
      setGroupProducts((items) =>
        items.map((current) =>
          current.product_id === item.product_id
            ? { ...current, is_featured: !current.is_featured }
            : current
        )
      );
    } catch (error) {
      logAdminActionError("Failed to update featured group product in admin", error, {
        groupId: id,
        productId: item.product_id,
      });
      toast.error("Failed to update featured product", {
        description: getApiErrorDescription(error, "Unknown error"),
      });
    }
  }

  async function moveProduct(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= groupProducts.length) return;

    const reordered = [...groupProducts];
    const [item] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, item);
    const normalized = reordered.map((row, sort_order) => ({ ...row, sort_order }));
    setGroupProducts(normalized);

    if (isNew) return;

    try {
      const res = await fetch(`/api/product-groups/${encodeURIComponent(id)}/products`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: normalized.map((row) => ({
            product_id: row.product_id,
            sort_order: row.sort_order,
            is_featured: row.is_featured,
          })),
        }),
      });
      if (!res.ok) throw await readApiError(res, "Reorder failed");
    } catch (error) {
      logAdminActionError("Failed to reorder group products in admin", error, {
        groupId: id,
      });
      toast.error("Failed to reorder products", {
        description: getApiErrorDescription(error, "Unknown error"),
      });
      await fetchGroupProducts();
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="mt-1">
          <Link href="/admin/product-groups">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-foreground">
            {isNew ? "New Product Group" : group?.name ?? "Product Group"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build a curated application-specific product set without changing source-managed products.
          </p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="card mb-6 p-4 sm:p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Group Details</h2>
            <p className="text-sm text-muted-foreground">
              These fields are catalog-owned and independent of product source data.
            </p>
          </div>
          {!isNew && (
            <Button type="button" variant="destructive" size="sm" onClick={deleteGroup}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="name" className="mb-1">Name</Label>
            <Input id="name" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="mt-1 text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="description" className="mb-1">Description</Label>
            <Textarea
              id="description"
              value={form.watch("description") ?? ""}
              onChange={(event) =>
                form.setValue("description", event.target.value || null, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              rows={4}
              placeholder="Optional customer-facing notes for this vehicle application"
            />
          </div>
          <div className="md:col-span-2">
            <MultiImageUpload
              label="Group images"
              value={groupImages}
              folder={uploadFolder}
              max={3}
              onQueueDelete={queueImageDeletion}
              onChange={(urls) =>
                form.setValue("images", urls, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
            {form.formState.errors.images && (
              <p className="mt-2 text-sm text-destructive">
                {form.formState.errors.images.message}
              </p>
            )}
          </div>
          <div>
            <Label className="mb-1">Vehicle Brand</Label>
            <Select
              value={form.watch("brand_id") ?? "none"}
              onValueChange={(value) =>
                form.setValue("brand_id", value === "none" ? null : value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any brand</SelectItem>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!selectedBrandId && (
              <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-500">
                No brand selected — this group won&apos;t appear in the customer
                catalog brand filter.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="sub_model" className="mb-1">Vehicle / Submodel</Label>
            <Input
              id="sub_model"
              value={form.watch("sub_model") ?? ""}
              onChange={(event) =>
                form.setValue("sub_model", event.target.value || null, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
            {!groupSubModel?.trim() && (
              <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-500">
                Without a submodel, product suggestions only match on brand and
                year.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="year_start" className="mb-1">Year start</Label>
              <Input
                id="year_start"
                type="number"
                value={form.watch("year_start") ?? ""}
                onChange={(event) =>
                  form.setValue(
                    "year_start",
                    event.target.value ? Number(event.target.value) : null,
                    { shouldDirty: true, shouldValidate: true }
                  )
                }
              />
              {form.formState.errors.year_start && (
                <p className="mt-1 text-sm text-destructive">{form.formState.errors.year_start.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="year_end" className="mb-1">Year end</Label>
              <Input
                id="year_end"
                type="number"
                value={form.watch("year_end") ?? ""}
                onChange={(event) =>
                  form.setValue(
                    "year_end",
                    event.target.value ? Number(event.target.value) : null,
                    { shouldDirty: true, shouldValidate: true }
                  )
                }
              />
              {form.formState.errors.year_end && (
                <p className="mt-1 text-sm text-destructive">{form.formState.errors.year_end.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1">Status</Label>
              <Select
                value={form.watch("status")}
                onValueChange={(value) =>
                  form.setValue("status", value as ProductGroupFormValues["status"], {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="sort_order" className="mb-1">Sort order</Label>
              <Input
                id="sort_order"
                type="number"
                {...form.register("sort_order", { valueAsNumber: true })}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button asChild variant="outline">
            <Link href="/admin/product-groups">Cancel</Link>
          </Button>
          <Button type="submit" disabled={saving || (!isNew && !form.formState.isDirty)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save group
          </Button>
        </div>
      </form>

      <div className={isNew ? "grid grid-cols-1 gap-6" : "grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]"}>
	            <section className={`card p-4 sm:p-6 ${suggestionAddPending ? "pointer-events-none opacity-70" : ""}`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Products</h2>
                <p className="text-sm text-muted-foreground">
                  {groupProducts.length} products {isNew ? "selected for this group." : "in this group."}
                </p>
              </div>
              <Button type="button" onClick={() => setProductPickerOpen(true)}>
                <Plus className="h-4 w-4" />
                Add products
              </Button>
            </div>

            {productsLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : groupProducts.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                Add products using the product picker.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {groupProducts.map((item, index) => (
                  <div key={item.product_id} className="flex items-center gap-3 rounded-md border p-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Badge variant={item.is_featured ? "default" : "secondary"}>
                        {index + 1}
                      </Badge>
                      <ProductSummary product={item.product} />
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant={item.is_featured ? "default" : "outline"}
                        size="icon-sm"
                        onClick={() => toggleFeatured(item)}
                        aria-label="Toggle featured"
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => moveProduct(index, -1)}
                        disabled={index === 0}
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => moveProduct(index, 1)}
                        disabled={index === groupProducts.length - 1}
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeProduct(item.product_id)}
                        aria-label="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {!isNew && (
          <aside className="flex flex-col gap-6">
            <section className="card p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Suggestions</h2>
                  <p className="text-sm text-muted-foreground">
                    Matches based on brand, vehicle/submodel, years, and compatibility data.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={fetchSuggestions}
	                  disabled={suggestionsLoading}
                  aria-label="Refresh suggestions"
                >
                  {suggestionsLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="mt-4 flex flex-col gap-3">
	                {suggestions.map((suggestion) => (
	                  <div key={suggestion.product.id} className="rounded-md border p-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <ProductSummary product={suggestion.product} />
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          Score {suggestion.score}. {suggestion.reason}
                        </p>
                      </div>
	                      <Button
	                        type="button"
	                        size="icon-sm"
	                        onClick={() => addSuggestionProduct(suggestion.product)}
	                        disabled={suggestionAddPending}
	                      >
	                        {suggestionAddPending ? (
	                          <Loader2 className="h-4 w-4 animate-spin" />
	                        ) : (
	                          <Plus className="h-4 w-4" />
	                        )}
	                      </Button>
                    </div>
                  </div>
                ))}
                {!suggestionsLoading && suggestions.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No suggestions available.
                  </p>
                )}
              </div>
            </section>
          </aside>
          )}
        </div>

      <Dialog
        open={productPickerOpen}
        onOpenChange={(open) => {
          setProductPickerOpen(open);
          if (!open) clearPickerSelection();
        }}
      >
        <DialogContent className="max-h-[88vh] gap-0 overflow-hidden p-0 sm:max-w-[min(1100px,calc(100vw-2rem))]">
          <DialogHeader className="border-b p-5">
            <DialogTitle>Add Products</DialogTitle>
            <DialogDescription>
              Select products to include in this group. Filters match the admin products view.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto p-5">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(220px,1fr)_220px_160px_220px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={pickerSearch}
                  onChange={(event) => handlePickerSearchChange(event.target.value)}
                  placeholder="Search code or description"
                  className="pl-10"
                />
              </div>
              <Select value={pickerPrimaryBrandFilter} onValueChange={handlePickerBrandChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Primary brand" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All primary brands</SelectItem>
                  {primaryBrands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={pickerStatusFilter} onValueChange={handlePickerStatusChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                  <SelectItem value="hidden">Hidden</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={pickerSubModelFilter}
                onValueChange={handlePickerSubModelChange}
                disabled={
                  pickerPrimaryBrandFilter === "all" ||
                  pickerSubModelsLoading ||
                  pickerSubModels.length === 0
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={pickerPrimaryBrandFilter === "all" ? "Select brand first" : "SubModel"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All submodels</SelectItem>
                  {pickerSubModels.map((subModel) => (
                    <SelectItem key={subModel} value={subModel}>
                      {subModel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border">
              <div className="max-h-[46vh] overflow-auto">
                <Table className="min-w-[820px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Add</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pickerLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center">
                          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : pickerProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                          No products found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pickerProducts.map((product) => {
                        const alreadyAdded = existingProductIds.has(product.id);
                        const selected = selectedProducts.has(product.id);
                        const description =
                          product.product_codes?.description_data?.generated ??
                          getProductDisplayName(product);

                        return (
                          <TableRow
                            key={product.id}
                            className={alreadyAdded ? "opacity-55" : "cursor-pointer"}
                            onClick={() => togglePickerProduct(product)}
                          >
                            <TableCell>
                              <input
                                type="checkbox"
                                checked={alreadyAdded || selected}
                                disabled={alreadyAdded}
                                onChange={() => togglePickerProduct(product)}
                                onClick={(event) => event.stopPropagation()}
                                aria-label={`Select ${productCode(product)}`}
                                className="h-4 w-4 rounded border-input accent-primary"
                              />
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {productCode(product)}
                              {alreadyAdded && (
                                <p className="mt-1 text-xs text-muted-foreground">Already added</p>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="block max-w-[280px] truncate text-sm">
                                {description}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="min-w-[140px]">
                                <div className="font-medium">
                                  {product.primary_brand?.name ?? "—"}
                                </div>
                                {product.additional_brands.length > 0 && (
                                  <div className="truncate text-xs text-muted-foreground">
                                    Also: {product.additional_brands.map((brand) => brand.name).join(", ")}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{product.model ?? "—"}</TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={productStatusColors[product.effective_status]}
                              >
                                {product.effective_status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex flex-col items-center justify-between gap-3 text-sm sm:flex-row">
              <span className="text-muted-foreground">
                {pickerRowCount} total products
              </span>
              <div className="flex items-center gap-2">
                <span className="mr-1 text-muted-foreground">
                  Page {pickerPage} of {pickerPageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPickerPage(1)}
                  disabled={pickerPage <= 1}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPickerPage((current) => Math.max(1, current - 1))}
                  disabled={pickerPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPickerPage((current) => Math.min(pickerPageCount, current + 1))}
                  disabled={pickerPage >= pickerPageCount}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPickerPage(pickerPageCount)}
                  disabled={pickerPage >= pickerPageCount}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t p-5">
            <Button type="button" variant="outline" onClick={() => setProductPickerOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="ghost" onClick={clearPickerSelection} disabled={selectedProductCount === 0}>
              Clear
            </Button>
            <Button type="button" onClick={addSelectedProducts} disabled={selectedProductCount === 0}>
              <Plus className="h-4 w-4" />
              Add {selectedProductCount || ""} selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

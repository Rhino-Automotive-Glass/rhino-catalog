"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, ShieldAlert } from "lucide-react";
import Link from "next/link";

import type { ProductWithSource } from "@/lib/types";
import type { RoleName } from "@/lib/roles";
import { productFormSchema, type ProductFormValues, emptyImages } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SingleImageUpload } from "@/components/image-upload";

/** Roles that can edit all product fields */
function canEditProducts(role: RoleName): boolean {
  return role === "super_admin" || role === "admin";
}

/** Roles that can edit images */
function canEditImages(role: RoleName): boolean {
  return role === "super_admin" || role === "admin" || role === "editor";
}

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [product, setProduct] = useState<ProductWithSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<RoleName | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      price: 0,
      stock: 0,
      primary_brand_id: null,
      additional_brand_ids: [],
      model: null,
      subModel: null,
      status: "draft",
      images: emptyImages,
    },
  });

  // Fetch user role
  useEffect(() => {
    fetch("/api/me/role")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setRole(data.role as RoleName))
      .catch(() => setRole(null))
      .finally(() => setRoleLoading(false));
  }, []);

  const fetchProduct = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error("Product not found");
      const data: ProductWithSource = await res.json();
      setProduct(data);

      const images = Array.isArray(data.images) ? data.images.slice(0, 1) : [];

      form.reset({
        price: Number(data.price),
        stock: data.stock,
        primary_brand_id: data.primary_brand_id,
        additional_brand_ids: data.additional_brands.map((brand) => brand.id),
        model: data.model,
        subModel: data.subModel,
        status: data.status,
        images,
      });
    } catch (err) {
      toast.error("Failed to load product", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, [id, form]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  const onSubmit = async (values: ProductFormValues) => {
    if (!role) return;

    setSaving(true);
    try {
      // Only catalog-owned fields are editable in this app
      const payload = canEditProducts(role)
        ? {
            price: values.price,
            stock: values.stock,
            status: values.status,
            images: values.images,
          }
        : { images: values.images };

      const res = await fetch(`/api/products/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Save failed");
      }
      toast.success("Product saved");
      router.refresh();
    } catch (err) {
      toast.error("Failed to save product", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading || roleLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!role) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-destructive" />
        <p className="text-lg font-medium">Access Denied</p>
        <p className="mt-1">You do not have permission to view this page.</p>
        <Link href="/admin/products" className="text-primary underline mt-4 inline-block">
          Back to list
        </Link>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Product not found.{" "}
        <Link href="/admin/products" className="text-primary underline">
          Back to list
        </Link>
      </div>
    );
  }

  const isAdmin = canEditProducts(role);
  const isEditor = canEditImages(role) && !isAdmin;
  const isViewOnly = !canEditImages(role);
  const images = form.watch("images");
  const compatibilityItems = product.product_codes?.compatibility_data?.items ?? [];
  const sourceUpdatedAt = product.product_codes?.updated_at
    ? new Date(product.product_codes.updated_at).toLocaleString()
    : "—";

  // Source-of-truth data from product_codes (read-only in this app)
  const sourceCode = product.product_codes?.product_code_data?.generated ?? "—";
  const sourceDescription = product.product_codes?.description_data?.generated ?? "—";

  // Use the product code as the image folder path
  const imageFolder = sourceCode !== "—" ? sourceCode : id;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3 sm:gap-4 mb-6">
        <Link href="/admin/products" className="shrink-0 mt-1">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground break-all">{sourceCode}</h1>
            <Badge variant="secondary">{product.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{sourceDescription}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Primary brand: {product.primary_brand?.name ?? "Unassigned"}
          </p>
        </div>
      </div>

      {/* Role notice */}
      {isEditor && (
        <div className="flex items-center gap-2 mb-6 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50 px-3 sm:px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>You have <strong>editor</strong> access. You can only update product images.</span>
        </div>
      )}
      {isViewOnly && (
        <div className="flex items-center gap-2 mb-6 rounded-lg border border-border bg-muted px-3 sm:px-4 py-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>You have <strong>view-only</strong> access. You cannot make changes to this product.</span>
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* Source Data (read-only — from product_codes) */}
        <div className="card p-4 sm:p-6 md:p-8 mb-6 opacity-80">
          <h2 className="text-lg font-semibold text-foreground mb-1">Source Data</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Managed in the Product Codes app. Read-only here.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1">Product Code</Label>
              <Input value={sourceCode} readOnly className="bg-muted" />
            </div>
            <div>
              <Label className="mb-1">Description</Label>
              <Input value={sourceDescription} readOnly className="bg-muted" />
            </div>
            <div>
              <Label className="mb-1">Source Status</Label>
              <Input
                value={product.product_codes?.status ?? "—"}
                readOnly
                className="bg-muted"
              />
            </div>
            <div>
              <Label className="mb-1">Verified</Label>
              <Input
                value={product.product_codes?.verified ? "Yes" : "No"}
                readOnly
                className="bg-muted"
              />
            </div>
            <div>
              <Label className="mb-1">Last Synced from Rhino Code</Label>
              <Input value={sourceUpdatedAt} readOnly className="bg-muted" />
            </div>
          </div>
        </div>

        {/* Pricing & Stock */}
        <fieldset disabled={!isAdmin} className={!isAdmin ? "opacity-60" : undefined}>
          <div className="card p-4 sm:p-6 md:p-8 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-3">Pricing & Stock</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="price" className="mb-1">Price</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  {...form.register("price", { valueAsNumber: true })}
                />
                {form.formState.errors.price && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.price.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="stock" className="mb-1">Stock</Label>
                <Input
                  id="stock"
                  type="number"
                  min="0"
                  {...form.register("stock", { valueAsNumber: true })}
                />
                {form.formState.errors.stock && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.stock.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="status" className="mb-1">Status</Label>
                <Select
                  value={form.watch("status")}
                  onValueChange={(v) =>
                    form.setValue("status", v as ProductFormValues["status"], {
                      shouldDirty: true,
                    })
                  }
                  disabled={!isAdmin}
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
            </div>
          </div>
        </fieldset>

        {/* Product Details (read-only, source of truth is product code DB) */}
        <fieldset disabled className="opacity-60">
          <div className="card p-4 sm:p-6 md:p-8 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-3">Product Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="mb-1">Primary Brand</Label>
                <Input value={product.primary_brand?.name ?? "Unassigned"} readOnly className="bg-muted" />
              </div>
              <div>
                <Label htmlFor="model" className="mb-1">Model</Label>
                <Input id="model" {...form.register("model")} disabled />
              </div>
              <div>
                <Label htmlFor="subModel" className="mb-1">Sub-Model</Label>
                <Input id="subModel" {...form.register("subModel")} disabled />
              </div>
            </div>
            <div className="mt-4">
              <Label className="mb-1">Product Compatibility</Label>
              {compatibilityItems.length === 0 ? (
                <Input value="No compatibility rows in product_codes" readOnly className="bg-muted" />
              ) : (
                <div className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {compatibilityItems.map((item, index) => {
                    const parts = [
                      item.marca,
                      item.modelo,
                      item.subModelo,
                      item.version,
                      item.additional,
                    ].filter(Boolean);

                    return (
                      <p key={index} className="truncate">
                        {parts.join(" / ")}
                      </p>
                    );
                  })}
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Compatibility is managed by the Product Codes app and mirrored here as read-only data.
              </p>
            </div>
          </div>
        </fieldset>

        {/* Images */}
        <fieldset disabled={isViewOnly} className={isViewOnly ? "opacity-60" : undefined}>
          <div className="card p-4 sm:p-6 md:p-8 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-3">Images</h2>
            <SingleImageUpload
              label="Product image"
              value={images[0]}
              folder={`${imageFolder}/images`}
              onChange={(url) =>
                form.setValue("images", url ? [url] : [], {
                  shouldDirty: true,
                })
              }
            />
          </div>
        </fieldset>

        {/* Save — hidden for view-only roles */}
        {!isViewOnly ? (
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
            <Link href="/admin/products">
              <Button variant="outline" type="button" className="w-full sm:w-auto">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={saving || !form.formState.isDirty} className="w-full sm:w-auto">
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isAdmin ? "Save Changes" : "Save Images"}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Link href="/admin/products">
              <Button variant="outline" type="button" className="w-full sm:w-auto">
                Back to list
              </Button>
            </Link>
          </div>
        )}
      </form>
    </div>
  );
}

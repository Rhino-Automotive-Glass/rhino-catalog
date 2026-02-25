"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import Link from "next/link";

import type { Product } from "@/lib/types";
import { productFormSchema, type ProductFormValues, emptyImages } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SingleImageUpload, MultiImageUpload } from "@/components/image-upload";

export default function EditProductPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: "",
      description: "",
      price: 0,
      stock: 0,
      rhino_code: "",
      rhino_description: "",
      brand: null,
      model: null,
      subModel: null,
      status: "draft",
      images: emptyImages,
    },
  });

  const fetchProduct = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error("Product not found");
      const data: Product = await res.json();
      setProduct(data);

      // Normalize images — merge with emptyImages to ensure structure
      const images = {
        main: { ...emptyImages.main, ...(data.images?.main ?? {}) },
        details: {
          left: data.images?.details?.left ?? [],
          right: data.images?.details?.right ?? [],
          back: data.images?.details?.back ?? [],
        },
      };

      form.reset({
        name: data.name,
        description: data.description,
        price: Number(data.price),
        stock: data.stock,
        rhino_code: data.rhino_code,
        rhino_description: data.rhino_description,
        brand: data.brand,
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
  }, [code, form]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  const onSubmit = async (values: ProductFormValues) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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

  const images = form.watch("images");

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/products">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{product.code}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{product.rhino_code}</p>
        </div>
        <Badge variant="secondary" className="ml-auto">
          {product.status}
        </Badge>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* Basic Info */}
        <div className="card p-6 md:p-8 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name" className="mb-1">Name</Label>
              <Input id="name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.name.message}
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

            <div className="md:col-span-2">
              <Label htmlFor="description" className="mb-1">Description</Label>
              <Textarea
                id="description"
                rows={3}
                {...form.register("description")}
              />
              {form.formState.errors.description && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.description.message}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Pricing & Stock */}
        <div className="card p-6 md:p-8 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Pricing & Stock</h2>
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
          </div>
        </div>

        {/* Product Details */}
        <div className="card p-6 md:p-8 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Product Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rhino_code" className="mb-1">Rhino Code (read-only)</Label>
              <Input
                id="rhino_code"
                {...form.register("rhino_code")}
                readOnly
                className="bg-gray-100 dark:bg-gray-700"
              />
            </div>
            <div>
              <Label htmlFor="rhino_description" className="mb-1">
                Rhino Description (read-only)
              </Label>
              <Input
                id="rhino_description"
                {...form.register("rhino_description")}
                readOnly
                className="bg-gray-100 dark:bg-gray-700"
              />
            </div>
            <div>
              <Label htmlFor="brand" className="mb-1">Brand</Label>
              <Input id="brand" {...form.register("brand")} />
            </div>
            <div>
              <Label htmlFor="model" className="mb-1">Model</Label>
              <Input id="model" {...form.register("model")} />
            </div>
            <div>
              <Label htmlFor="subModel" className="mb-1">Sub-Model</Label>
              <Input id="subModel" {...form.register("subModel")} />
            </div>
          </div>
        </div>

        {/* Images */}
        <div className="card p-6 md:p-8 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Images</h2>

          {/* Main images */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Main Images
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {(["left", "right", "back"] as const).map((side) => (
                <SingleImageUpload
                  key={side}
                  label={`Main ${side}`}
                  value={images.main[side]}
                  folder={`${code}/main`}
                  onChange={(url) => {
                    const updated = { ...images };
                    updated.main = { ...updated.main, [side]: url };
                    // Remove the key entirely if undefined
                    if (!url) delete updated.main[side];
                    form.setValue("images", updated, { shouldDirty: true });
                  }}
                />
              ))}
            </div>
          </div>

          {/* Detail images */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Detail Images
            </h3>
            <div className="grid grid-cols-1 gap-6">
              {(["left", "right", "back"] as const).map((side) => (
                <MultiImageUpload
                  key={side}
                  label={`Detail ${side}`}
                  value={images.details[side]}
                  max={3}
                  folder={`${code}/details/${side}`}
                  onChange={(urls) => {
                    const updated = { ...images };
                    updated.details = { ...updated.details, [side]: urls };
                    form.setValue("images", updated, { shouldDirty: true });
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end gap-3">
          <Link href="/admin/products">
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={saving || !form.formState.isDirty}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}

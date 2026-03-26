import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { z } from "zod";
import { productFormSchema, productImagesSchema } from "@/lib/schemas";
import { getUserRole, canEditProducts, canEditImages } from "@/lib/roles";
import { mapProductRow, PRODUCT_WITH_SOURCE_INNER_SELECT } from "@/lib/product-query";

type RouteContext = { params: Promise<{ id: string }> };

async function fetchProductByIdentifier(id: string) {
  const supabase = await createClient();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const query = supabase
    .from("products")
    .select(PRODUCT_WITH_SOURCE_INNER_SELECT);

  const { data, error } = await (
    isUuid
      ? query.eq("id", id)
      : query.eq("product_codes.product_code_data->>generated", id)
  ).single();

  if (error) {
    return { data: null, error };
  }

  return {
    data: mapProductRow(data),
    error: null,
  };
}

/** GET /api/products/[id] — fetch a single product by id or product code */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { data, error } = await fetchProductByIdentifier(id);

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data);
}

/** PATCH /api/products/[id] — update a product (role-gated) */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const supabase = await createClient();
  const userRole = await getUserRole();

  if (!userRole) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!canEditImages(userRole.role)) {
    return NextResponse.json(
      { error: "You do not have permission to edit products" },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  const body = await req.json();
  const { data: product, error: productError } = await fetchProductByIdentifier(id);

  if (productError) {
    const status = productError.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: productError.message }, { status });
  }

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  if (product.is_hidden) {
    return NextResponse.json(
      {
        error: product.hidden_reason ?? "Hidden products are read-only in this app",
      },
      { status: 403 }
    );
  }

  // Editors: can only update images
  if (!canEditProducts(userRole.role)) {
    if (!body.images) {
      return NextResponse.json(
        { error: "Editors can only update product images" },
        { status: 403 }
      );
    }

    const imagesParsed = productImagesSchema.safeParse(body.images);
    if (!imagesParsed.success) {
      return NextResponse.json(
        { error: "Invalid images data", details: imagesParsed.error.flatten() },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("products")
      .update({ images: imagesParsed.data })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  }

  // Admin / super_admin: only catalog-owned fields are editable here
  const editableSchema = z
    .object({
      price: productFormSchema.shape.price,
      stock: productFormSchema.shape.stock,
      status: productFormSchema.shape.status,
      images: productImagesSchema,
    })
    .partial();

  const parsed = editableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { error: updateError } = await supabase
    .from("products")
    .update(parsed.data)
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { data, error } = await fetchProductByIdentifier(id);

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data);
}

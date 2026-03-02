import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { productFormSchema, productImagesSchema } from "@/lib/schemas";
import { getUserRole, canEditProducts, canEditImages } from "@/lib/roles";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/products/[id] — fetch a single product by id or product code */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  // UUID v4 pattern — if it matches, look up by products.id; otherwise treat as a product code
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const query = supabase
    .from("products")
    .select(
      `
      *,
      product_codes!products_product_code_id_fkey!inner (
        id,
        product_code_data,
        description_data,
        compatibility_data,
        status,
        verified
      )
    `
    );

  const { data, error } = await (
    isUuid
      ? query.eq("id", id)
      : query.eq("product_codes.product_code_data->>generated", id)
  ).single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data);
}

/** PATCH /api/products/[id] — update a product (role-gated) */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
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

  // Admin / super_admin: full update (catalog-owned fields only)
  const parsed = productFormSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("products")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

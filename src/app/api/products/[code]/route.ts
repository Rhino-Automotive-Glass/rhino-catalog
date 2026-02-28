import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { productFormSchema, productImagesSchema } from "@/lib/schemas";
import { getUserRole, canEditProducts, canEditImages } from "@/lib/roles";

type RouteContext = { params: Promise<{ code: string }> };

/** GET /api/products/[code] — fetch a single product by code */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { code } = await ctx.params;

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("code", code)
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data);
}

/** PATCH /api/products/[code] — update a product (role-gated) */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  // Authenticate and get role
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

  const { code } = await ctx.params;
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
      .eq("code", code)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  }

  // Admin / super_admin: full update
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
    .eq("code", code)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

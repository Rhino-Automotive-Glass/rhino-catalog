import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { productFormSchema } from "@/lib/schemas";

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

/** PATCH /api/products/[code] — update a product */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { code } = await ctx.params;
  const body = await req.json();

  // Validate with Zod (partial — only submitted fields)
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

import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-admin";
import { getUserRole, canManageProductGroups } from "@/lib/roles";
import {
  PRODUCT_GROUP_SELECT,
  getProductGroupSuggestionReason,
  getProductGroupSuggestionScore,
  isUuid,
  mapProductGroupRow,
} from "@/lib/product-group-query";
import {
  PRODUCT_WITH_SOURCE_BRAND_FILTER_SELECT,
  PRODUCT_WITH_SOURCE_SELECT,
  mapProductRow,
} from "@/lib/product-query";
import type { ProductGroupSuggestion } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const userRole = await getUserRole();

  if (!userRole) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!canManageProductGroups(userRole.role)) {
    return NextResponse.json(
      { error: "You do not have permission to manage product groups" },
      { status: 403 }
    );
  }

  let supabase: SupabaseClient;

  try {
    supabase = createAdminClient();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Server read client is not configured",
      },
      { status: 500 }
    );
  }

  const { id } = await ctx.params;
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20)));
  const groupQuery = supabase.from("product_groups").select(PRODUCT_GROUP_SELECT);
  const { data: groupData, error: groupError } = await (isUuid(id)
    ? groupQuery.eq("id", id)
    : groupQuery.eq("slug", id)
  ).single();

  if (groupError) {
    const status = groupError.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: groupError.message }, { status });
  }

  const group = mapProductGroupRow(groupData);
  const { data: existingRows, error: existingError } = await supabase
    .from("product_group_products")
    .select("product_id")
    .eq("group_id", group.id);

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const existingProductIds = new Set((existingRows ?? []).map((row) => row.product_id as string));
  let productQuery = supabase
    .from("products")
    .select(
      group.brand_id
        ? PRODUCT_WITH_SOURCE_BRAND_FILTER_SELECT
        : PRODUCT_WITH_SOURCE_SELECT
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  if (group.brand_id) {
    productQuery = productQuery.eq("product_brands.brand_id", group.brand_id);
  }

  const { data, error } = await productQuery;

  if (error) {
    console.error("GET /api/product-groups/[id]/suggestions failed", {
      id,
      code: error.code,
      details: error.details,
      hint: error.hint,
      message: error.message,
    });

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const suggestions: ProductGroupSuggestion[] = (data ?? [])
    .map((row) => mapProductRow(row))
    .filter((product) => !product.is_hidden && !existingProductIds.has(product.id))
    .map((product) => ({
      product,
      score: getProductGroupSuggestionScore(product, group),
      reason: getProductGroupSuggestionReason(product, group),
    }))
    .filter((suggestion) => suggestion.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return NextResponse.json({ data: suggestions, count: suggestions.length });
}

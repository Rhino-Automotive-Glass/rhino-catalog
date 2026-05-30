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
import { apiFailure } from "@/lib/api-error-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const userRole = await getUserRole();

  if (!userRole) {
    return NextResponse.json(
      {
        error: "Not authenticated",
        userMessage: "Your session expired. Sign in again to load suggestions.",
      },
      { status: 401 }
    );
  }

  if (!canManageProductGroups(userRole.role)) {
    return NextResponse.json(
      {
        error: "You do not have permission to manage product groups",
        userMessage: "Your account does not have permission to load group suggestions.",
      },
      { status: 403 }
    );
  }

  let supabase: SupabaseClient;

  try {
    supabase = createAdminClient();
  } catch (error) {
    return apiFailure({
      context: "GET /api/product-groups/[id]/suggestions admin client setup failed",
      error,
      userMessage:
        "Suggestions could not be loaded because server read access is not configured.",
    });
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
    return NextResponse.json(
      {
        error: groupError.message,
        userMessage:
          status === 404
            ? "This product group could not be found. It may have been deleted."
            : "The product group could not be loaded before finding suggestions.",
      },
      { status }
    );
  }

  const group = mapProductGroupRow(groupData);
  const { data: existingRows, error: existingError } = await supabase
    .from("product_group_products")
    .select("product_id")
    .eq("group_id", group.id);

  if (existingError) {
    return apiFailure({
      context: "GET /api/product-groups/[id]/suggestions memberships failed",
      error: existingError,
      userMessage:
        "Suggestions could not be loaded because current group products could not be checked.",
      log: { id, groupId: group.id },
    });
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
    return apiFailure({
      context: "GET /api/product-groups/[id]/suggestions failed",
      error,
      userMessage:
        "Suggestions could not be loaded. Refresh the page or contact support with the debug ID.",
      log: {
        id,
        groupId: group.id,
        brandId: group.brand_id,
      },
    });
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

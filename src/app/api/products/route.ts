import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  getProductSubModels,
  PRODUCT_WITH_SOURCE_BRAND_FILTER_SELECT,
  mapProductRow,
  PRODUCT_WITH_SOURCE_SELECT,
} from "@/lib/product-query";
import { matchesVisibilityStatus } from "@/lib/product-visibility";

/**
 * GET /api/products
 * Returns a paginated, filterable list of products joined with product_codes.
 *
 * Query params:
 *   page           – 1-based page number (default 1)
 *   pageSize       – rows per page (default 20)
 *   primaryBrandId – exact match on products.primary_brand_id
 *   brandId        – match any brand membership via product_brands
 *   status         – derived display status (draft / published / archived / hidden)
 *   visibility     – visible (default) or all; catalog uses visible, admin uses all
 *   search         – loose match on model / subModel
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = req.nextUrl;
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
  const search = searchParams.get("search") ?? "";
  const primaryBrandId = searchParams.get("primaryBrandId") ?? "";
  const brandId = searchParams.get("brandId") ?? "";
  const subModel = searchParams.get("subModel") ?? "";
  const status = searchParams.get("status") ?? "";
  const visibility = searchParams.get("visibility") ?? "visible";
  const normalizedVisibility = visibility === "all" ? "all" : "visible";

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const hasDerivedSubModelFilter = Boolean(subModel && subModel !== "all");
  const shouldUseRawStatusFilter = Boolean(status && status !== "all" && status !== "hidden");
  const requiresDerivedFiltering =
    hasDerivedSubModelFilter ||
    normalizedVisibility !== "all" ||
    Boolean(status && status !== "all");

  let query = supabase
    .from("products")
    .select(
      brandId && brandId !== "all"
        ? PRODUCT_WITH_SOURCE_BRAND_FILTER_SELECT
        : PRODUCT_WITH_SOURCE_SELECT,
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (primaryBrandId && primaryBrandId !== "all") {
    query = query.eq("primary_brand_id", primaryBrandId);
  }

  if (brandId && brandId !== "all") {
    query = query.eq("product_brands.brand_id", brandId);
  }

  if (shouldUseRawStatusFilter) {
    query = query.eq("status", status);
  }

  if (search) {
    query = query.or(`model.ilike.%${search}%,subModel.ilike.%${search}%`);
  }

  if (!requiresDerivedFiltering) {
    query = query.range(from, to);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("GET /api/products failed", {
      code: error.code,
      details: error.details,
      hint: error.hint,
      message: error.message,
      primaryBrandId,
      brandId,
      subModel,
      status,
      visibility: normalizedVisibility,
      search,
    });

    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      },
      { status: 500 }
    );
  }

  const mappedProducts = (data ?? []).map((row) => mapProductRow(row));
  let filteredProducts = mappedProducts;

  if (normalizedVisibility === "visible") {
    filteredProducts = filteredProducts.filter((product) => !product.is_hidden);
  }

  if (status && status !== "all") {
    filteredProducts = filteredProducts.filter((product) =>
      matchesVisibilityStatus(product.effective_status, status)
    );
  }

  if (hasDerivedSubModelFilter) {
    const normalizedSubModel = subModel.trim().toLowerCase();
    filteredProducts = filteredProducts.filter((product) =>
      getProductSubModels(product).some(
        (candidate) => candidate.toLowerCase() === normalizedSubModel
      )
    );
  }

  if (requiresDerivedFiltering) {
    return NextResponse.json({
      data: filteredProducts.slice(from, to + 1),
      count: filteredProducts.length,
      page,
      pageSize,
    });
  }

  return NextResponse.json({
    data: filteredProducts,
    count: count ?? 0,
    page,
    pageSize,
  });
}

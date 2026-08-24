import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  getProductSubModels,
  matchesProductSearch,
  PRODUCT_WITH_SOURCE_BRAND_FILTER_SELECT,
  mapProductRow,
  PRODUCT_WITH_SOURCE_SELECT,
} from "@/lib/product-query";
import { matchesVisibilityStatus } from "@/lib/product-visibility";
import { apiFailure } from "@/lib/api-error-response";
import { parseIntParam } from "@/lib/query-params";

type RawProductRow = Parameters<typeof mapProductRow>[0];

/** PostgREST caps a single response at db-max-rows (1000 on Supabase). */
const ROW_BATCH_SIZE = 1000;

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
 *   search         – loose match on code / description / model / subModel
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = req.nextUrl;
  const page = parseIntParam(searchParams.get("page"), { fallback: 1 });
  const pageSize = parseIntParam(searchParams.get("pageSize"), { fallback: 20, max: 100 });
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
    Boolean(status && status !== "all") ||
    Boolean(search);

  function buildQuery(withCount: boolean) {
    let query = supabase
      .from("products")
      .select(
        brandId && brandId !== "all"
          ? PRODUCT_WITH_SOURCE_BRAND_FILTER_SELECT
          : PRODUCT_WITH_SOURCE_SELECT,
        withCount ? { count: "exact" } : undefined
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

    return query;
  }

  function productsFailure(error: unknown) {
    return apiFailure({
      context: "GET /api/products failed",
      error,
      userMessage:
        "Products could not be loaded. Refresh the page or contact support with the debug ID.",
      log: {
        primaryBrandId,
        brandId,
        subModel,
        status,
        visibility: normalizedVisibility,
        search,
      },
    });
  }

  const rawRows: RawProductRow[] = [];
  let count: number | null = null;

  if (requiresDerivedFiltering) {
    // Visibility, derived status, submodel and search are all computed in JS
    // from the joined source row, so the whole filtered set has to be loaded
    // before it can be paginated. A single PostgREST response is capped at
    // db-max-rows (1000 on Supabase), so page through it in batches — the same
    // approach /api/brands uses for this table.
    let offset = 0;
    let total: number | null = null;
    let serverBatchSize = ROW_BATCH_SIZE;
    let isFirstBatch = true;

    for (;;) {
      const {
        data,
        error,
        count: batchCount,
      } = await buildQuery(isFirstBatch).range(offset, offset + ROW_BATCH_SIZE - 1);

      if (error) {
        return productsFailure(error);
      }

      const batch = (data ?? []) as unknown as RawProductRow[];

      if (isFirstBatch) {
        if (typeof batchCount === "number") {
          total = batchCount;
        }
        // The server may cap responses below ROW_BATCH_SIZE. Learn the real
        // stride from the first batch so a short batch isn't mistaken for the
        // end of the result set when no exact count came back.
        if (batch.length > 0) {
          serverBatchSize = batch.length;
        }
        isFirstBatch = false;
      }

      rawRows.push(...batch);
      // Advance by the batch length rather than a fixed stride so the offsets
      // stay aligned with what the server actually returned.
      offset += batch.length;

      if (batch.length === 0) break;
      if (total !== null ? offset >= total : batch.length < serverBatchSize) break;
    }
  } else {
    const { data, error, count: exactCount } = await buildQuery(true).range(from, to);

    if (error) {
      return productsFailure(error);
    }

    rawRows.push(...((data ?? []) as unknown as RawProductRow[]));
    count = exactCount;
  }

  const mappedProducts = rawRows.map((row) => mapProductRow(row));
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

  if (search) {
    filteredProducts = filteredProducts.filter((product) =>
      matchesProductSearch(product, search)
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

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import type { BrandListResponse, ProductCode } from "@/lib/types";
import { isProductHidden } from "@/lib/product-visibility";

type RawBrand = {
  id: string;
  name: string;
};

type BrandCountRow = {
  primary_brand_id: string | null;
  primary_brand: RawBrand | RawBrand[] | null;
  product_brands: { brand: RawBrand | RawBrand[] | null }[] | null;
  product_codes: { product_code_data?: { parte?: unknown } } | null;
};

/**
 * Counting products per brand only needs the brand relations plus the one field
 * the hidden rule reads (product_code_data.parte).
 *
 * The full product select drags along description_data and compatibility_data,
 * which are large JSON blobs — roughly 1.27 MB per 1000 rows versus 396 KB for
 * this one, on a query that walks the whole table.
 */
const BRAND_COUNT_SELECT = `
  primary_brand_id,
  primary_brand:brands!products_primary_brand_id_fkey (
    id,
    name
  ),
  product_brands:product_brands!product_brands_product_id_fkey (
    brand:brands!product_brands_brand_id_fkey (
      id,
      name
    )
  ),
  product_codes!products_product_code_id_fkey!inner (
    product_code_data
  )
`;

const CATALOG_INCLUDED_BRANDS = ["Nissan"];

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function dedupeById(brands: RawBrand[]): RawBrand[] {
  const seen = new Set<string>();

  return brands.filter((brand) => {
    if (seen.has(brand.id)) return false;
    seen.add(brand.id);
    return true;
  });
}

/**
 * GET /api/brands
 * Returns brand options for the catalog and admin UI.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const scope = req.nextUrl.searchParams.get("scope") ?? "all";
  const status = req.nextUrl.searchParams.get("status") ?? "all";

  if (scope === "catalog") {
    const brandCounts = new Map<string, RawBrand & { productCount: number }>();
    let from = 0;
    const batchSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from("products")
        .select(BRAND_COUNT_SELECT)
        .order("created_at", { ascending: false })
        .range(from, from + batchSize - 1);

      if (error) {
        console.error("GET /api/brands catalog scope failed", {
          code: error.code,
          details: error.details,
          hint: error.hint,
          message: error.message,
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

      for (const row of (data ?? []) as unknown as BrandCountRow[]) {
        if (isProductHidden(row.product_codes as ProductCode | null)) continue;

        const primaryBrand = unwrapRelation(row.primary_brand);
        const relatedBrands = [
          ...(primaryBrand ? [primaryBrand] : []),
          ...(row.product_brands ?? [])
            .map((item) => unwrapRelation(item.brand))
            .filter((brand): brand is RawBrand => Boolean(brand))
            // A brand that is both primary and a membership row must not be
            // counted twice for the same product.
            .filter((brand) => brand.id !== primaryBrand?.id),
        ];

        for (const brand of dedupeById(relatedBrands)) {
          const current = brandCounts.get(brand.id);
          if (current) {
            current.productCount += 1;
            continue;
          }

          brandCounts.set(brand.id, {
            id: brand.id,
            name: brand.name,
            productCount: 1,
          });
        }
      }

      if (!data || data.length < batchSize) break;
      from += batchSize;
    }

    const { data: includedBrands, error: includedBrandsError } = await supabase
      .from("brands")
      .select("id, name")
      .in("name", CATALOG_INCLUDED_BRANDS);

    if (includedBrandsError) {
      console.error("GET /api/brands catalog included brands failed", {
        code: includedBrandsError.code,
        details: includedBrandsError.details,
        hint: includedBrandsError.hint,
        message: includedBrandsError.message,
      });

      return NextResponse.json(
        {
          error: includedBrandsError.message,
          code: includedBrandsError.code,
          details: includedBrandsError.details,
          hint: includedBrandsError.hint,
        },
        { status: 500 }
      );
    }

    for (const brand of includedBrands ?? []) {
      if (brandCounts.has(brand.id)) continue;
      brandCounts.set(brand.id, {
        id: brand.id,
        name: brand.name,
        productCount: 0,
      });
    }

    return NextResponse.json<BrandListResponse>({
      brands: [...brandCounts.values()].sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  if (scope === "primary") {
    const allBrands = new Map<string, RawBrand>();
    let from = 0;
    const batchSize = 1000;

    while (true) {
      let query = supabase
        .from("products")
        .select(`
          primary_brand:brands!products_primary_brand_id_fkey (
            id,
            name
          )
        `)
        .not("primary_brand_id", "is", null)
        .order("created_at", { ascending: false })
        .range(from, from + batchSize - 1);

      if (status !== "all") {
        query = query.eq("status", status);
      }

      const { data, error } = await query;

      if (error) {
        console.error("GET /api/brands primary scope failed", {
          code: error.code,
          details: error.details,
          hint: error.hint,
          message: error.message,
          status,
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

      for (const row of data ?? []) {
        const primaryBrand = unwrapRelation(row.primary_brand as RawBrand | RawBrand[] | null);
        if (primaryBrand) {
          allBrands.set(primaryBrand.id, primaryBrand);
        }
      }

      if (!data || data.length < batchSize) break;
      from += batchSize;
    }

    return NextResponse.json<BrandListResponse>({
      brands: [...allBrands.values()].sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  const { data, error } = await supabase
    .from("brands")
    .select("id, name")
    .order("name");

  if (error) {
    console.error("GET /api/brands failed", {
      code: error.code,
      details: error.details,
      hint: error.hint,
      message: error.message,
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

  return NextResponse.json<BrandListResponse>({
    brands: (data ?? []) as RawBrand[],
  });
}

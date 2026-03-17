import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import type { BrandListResponse } from "@/lib/types";

type RawBrand = {
  id: string;
  name: string;
};

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
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
        .from("product_brands")
        .select(`
          product_id,
          brand:brands!product_brands_brand_id_fkey (
            id,
            name
          )
        `)
        .order("product_id", { ascending: true })
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

      for (const row of data ?? []) {
        const brand = unwrapRelation(row.brand as RawBrand | RawBrand[] | null);
        if (!brand) continue;

        const current = brandCounts.get(brand.id);
        if (current) {
          current.productCount += 1;
          continue;
        }

        brandCounts.set(brand.id, {
          ...brand,
          productCount: 1,
        });
      }

      if (!data || data.length < batchSize) break;
      from += batchSize;
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

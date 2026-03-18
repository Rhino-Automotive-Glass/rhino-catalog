import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  getProductSubModels,
  PRODUCT_WITH_SOURCE_BRAND_FILTER_SELECT,
  mapProductRow,
} from "@/lib/product-query";
import type { SubModelListResponse } from "@/lib/types";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const brandId = req.nextUrl.searchParams.get("brandId") ?? "";

  if (!brandId || brandId === "all") {
    return NextResponse.json<SubModelListResponse>({ subModels: [] });
  }

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_WITH_SOURCE_BRAND_FILTER_SELECT)
    .eq("product_brands.brand_id", brandId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("GET /api/products/submodels failed", {
      code: error.code,
      details: error.details,
      hint: error.hint,
      message: error.message,
      brandId,
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

  const subModels = Array.from(
    new Set(
      (data ?? [])
        .flatMap((row) => getProductSubModels(mapProductRow(row)))
        .sort((a, b) => a.localeCompare(b))
    )
  );

  return NextResponse.json<SubModelListResponse>({ subModels });
}

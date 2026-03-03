import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/brands
 * Returns distinct brand names from published products.
 */
export async function GET() {
  // Fetch all brands in pages to avoid Supabase's default 1000-row limit
  const allBrands = new Set<string>();
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("brand")
      .not("brand", "is", null)
      .order("brand")
      .range(from, from + batchSize - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const r of data ?? []) {
      allBrands.add(r.brand as string);
    }

    if (!data || data.length < batchSize) break;
    from += batchSize;
  }

  const brands = [...allBrands].sort();

  return NextResponse.json({ brands });
}

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { ProductCode } from "@/lib/types";

/**
 * POST /api/products/migrate
 *
 * One-time migration: reads all product_codes rows and inserts into products
 * using the mapping rules. Uses ON CONFLICT (code) DO NOTHING to skip existing.
 */
export async function POST() {
  // Fetch all product_codes — paginate to handle large tables
  const allCodes: ProductCode[] = [];
  let offset = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("product_codes")
      .select("id, compatibility_data, description_data, product_code_data")
      .range(offset, offset + batchSize - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) break;
    allCodes.push(...(data as ProductCode[]));
    if (data.length < batchSize) break;
    offset += batchSize;
  }

  if (allCodes.length === 0) {
    return NextResponse.json({ message: "No product_codes found", inserted: 0 });
  }

  // Map product_codes → products rows
  const rows = allCodes
    .map((pc) => {
      const compatItems = pc.compatibility_data?.items ?? [];
      const firstItem = compatItems[0];
      const code = pc.product_code_data?.generated ?? "";

      // Skip rows with no code — can't create a product without one
      if (!code) return null;

      // Brands: deduplicate, store array + primary brand as plain text
      const uniqueBrands = [...new Set(compatItems.map((i) => i.marca).filter(Boolean))];
      const brand = uniqueBrands[0] ?? null;

      return {
        product_code_id: pc.id,
        code,
        name: pc.compatibility_data?.generated ?? "",
        description: pc.description_data?.generated ?? "",
        rhino_code: code,
        rhino_description: pc.description_data?.generated ?? "",
        brand,
        brands: uniqueBrands,
        model: firstItem?.modelo ?? null,
        subModel: firstItem?.subModelo ?? null,
        price: 0,
        stock: 0,
        images: {},
        status: "draft",
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Insert in batches of 500 with ON CONFLICT DO NOTHING
  let totalInserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error, count } = await supabase
      .from("products")
      .upsert(batch, { onConflict: "code", ignoreDuplicates: true, count: "exact" });

    if (error) {
      return NextResponse.json(
        { error: error.message, insertedSoFar: totalInserted },
        { status: 500 }
      );
    }
    totalInserted += count ?? batch.length;
  }

  return NextResponse.json({
    message: `Migration complete`,
    totalCodes: allCodes.length,
    inserted: totalInserted,
  });
}

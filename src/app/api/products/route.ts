import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/products
 * Returns a paginated, filterable list of products.
 *
 * Query params:
 *   page     – 1-based page number (default 1)
 *   pageSize – rows per page (default 20)
 *   search   – filters code, name, brand (ilike)
 *   status   – exact match on status column
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("products")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search) {
    // Search across code, name, and brand using OR ilike
    query = query.or(
      `code.ilike.%${search}%,name.ilike.%${search}%,brand.ilike.%${search}%`
    );
  }

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data ?? [],
    count: count ?? 0,
    page,
    pageSize,
  });
}

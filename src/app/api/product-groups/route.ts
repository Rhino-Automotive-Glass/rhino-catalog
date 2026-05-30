import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { getUserRole, canManageProductGroups } from "@/lib/roles";
import {
  PRODUCT_GROUP_SELECT,
  buildProductGroupSearchFilter,
  isUniqueViolation,
  mapProductGroupRow,
  resolveUniqueProductGroupSlug,
} from "@/lib/product-group-query";
import { productGroupCreateSchema } from "@/lib/schemas";
import type { PaginatedResponse, ProductGroup } from "@/lib/types";
import { apiFailure } from "@/lib/api-error-response";

function cleanPayload<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 50)));
  const status = searchParams.get("status") ?? "";
  const scope = searchParams.get("scope") ?? "admin";
  const search = searchParams.get("search")?.trim() ?? "";
  const brandId = searchParams.get("brandId") ?? "";
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const isCatalogScope = scope === "catalog";

  let supabase: SupabaseClient;

  if (isCatalogScope) {
    supabase = await createClient();
  } else {
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
  }

  let query = supabase
    .from("product_groups")
    .select(PRODUCT_GROUP_SELECT, { count: "exact" })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .range(from, to);

  if (isCatalogScope) {
    query = query.eq("status", "published");
  } else if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (brandId && brandId !== "all") {
    query = query.eq("brand_id", brandId);
  }

  if (search) {
    const searchFilter = buildProductGroupSearchFilter(search);
    if (searchFilter) {
      query = query.or(searchFilter);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    return apiFailure({
      context: "GET /api/product-groups failed",
      error,
      userMessage:
        "Product groups could not be loaded. Refresh the page or contact support with the debug ID.",
      log: {
        status,
        scope,
        brandId,
        search,
      },
    });
  }

  return NextResponse.json<PaginatedResponse<ProductGroup>>({
    data: (data ?? []).map((row) => mapProductGroupRow(row)),
    count: count ?? 0,
    page,
    pageSize,
  });
}

export async function POST(req: NextRequest) {
  const userRole = await getUserRole();

  if (!userRole) {
    return NextResponse.json(
      {
        error: "Not authenticated",
        userMessage: "Your session expired. Sign in again before creating a product group.",
      },
      { status: 401 }
    );
  }

  if (!canManageProductGroups(userRole.role)) {
    return NextResponse.json(
      {
        error: "You do not have permission to manage product groups",
        userMessage: "Your account does not have permission to create product groups.",
      },
      { status: 403 }
    );
  }

  const body = await req.json();
  const parsed = productGroupCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        userMessage:
          "Some product group fields are invalid. Check the required name, year range, status, and images.",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  let adminSupabase: SupabaseClient;

  try {
    adminSupabase = createAdminClient();
  } catch (error) {
    return apiFailure({
      context: "POST /api/product-groups admin client setup failed",
      error,
      userMessage:
        "Product group could not be created because server write access is not configured.",
    });
  }

  const basePayload = cleanPayload(parsed.data);
  let data = null;
  let error = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const insertPayload = { ...basePayload };

    if (typeof insertPayload.slug === "string") {
      try {
        insertPayload.slug = await resolveUniqueProductGroupSlug(
          adminSupabase,
          insertPayload.slug
        );
      } catch (slugError) {
        return apiFailure({
          context: "POST /api/product-groups slug generation failed",
          error: slugError,
          userMessage:
            "A unique group URL could not be generated. Please adjust the group name or vehicle fields and try again.",
          log: { slug: insertPayload.slug },
        });
      }
    }

    const result = await adminSupabase
      .from("product_groups")
      .insert(insertPayload)
      .select(PRODUCT_GROUP_SELECT)
      .single();

    data = result.data;
    error = result.error;

    if (!error || !isUniqueViolation(error)) break;
  }

  if (error) {
    return apiFailure({
      context: "POST /api/product-groups failed",
      error,
      userMessage:
        "The product group could not be saved. Please try again or contact support with the debug ID.",
      log: {
        payload: parsed.data,
      },
    });
  }

  if (!data) {
    return NextResponse.json(
      { error: "Product group was not returned after save" },
      { status: 500 }
    );
  }

  return NextResponse.json(mapProductGroupRow(data), { status: 201 });
}

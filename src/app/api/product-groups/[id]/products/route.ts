import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { getUserRole, canManageProductGroups } from "@/lib/roles";
import {
  PRODUCT_GROUP_PRODUCT_SELECT,
  PRODUCT_GROUP_SELECT,
  isUuid,
  mapProductGroupProductRow,
  mapProductGroupRow,
} from "@/lib/product-group-query";
import {
  productGroupProductAddSchema,
  productGroupProductUpdateSchema,
} from "@/lib/schemas";
import type { ProductGroupProductsResponse } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

async function fetchGroupId(
  supabase: SupabaseClient,
  identifier: string,
  publishedOnly = false
) {
  const query = supabase.from("product_groups").select(PRODUCT_GROUP_SELECT);
  let groupQuery = isUuid(identifier)
    ? query.eq("id", identifier)
    : query.eq("slug", identifier);

  if (publishedOnly) {
    groupQuery = groupQuery.eq("status", "published");
  }

  const { data, error } = await groupQuery.single();

  if (error) return { groupId: null, group: null, error };

  const group = mapProductGroupRow(data);
  return { groupId: group.id, group, error: null };
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const scope = req.nextUrl.searchParams.get("scope") ?? "admin";
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

  const {
    groupId,
    group,
    error: groupError,
  } = await fetchGroupId(supabase, id, isCatalogScope);

  if (groupError || !groupId || !group) {
    const status = groupError?.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: groupError?.message ?? "Group not found" }, { status });
  }

  if (isCatalogScope && group.status !== "published") {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("product_group_products")
    .select(PRODUCT_GROUP_PRODUCT_SELECT)
    .eq("group_id", groupId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("GET /api/product-groups/[id]/products failed", {
      id,
      code: error.code,
      details: error.details,
      hint: error.hint,
      message: error.message,
    });

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let items = (data ?? [])
    .map((row) => mapProductGroupProductRow(row))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (isCatalogScope) {
    items = items.filter((item) => !item.product.is_hidden);
  }

  return NextResponse.json<ProductGroupProductsResponse>({
    data: items,
    count: items.length,
  });
}

export async function POST(req: NextRequest, ctx: RouteContext) {
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

  const { id } = await ctx.params;
  const parsed = productGroupProductAddSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  let adminSupabase: SupabaseClient;

  try {
    adminSupabase = createAdminClient();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Server write client is not configured",
      },
      { status: 500 }
    );
  }

  const { groupId, error: groupError } = await fetchGroupId(adminSupabase, id);

  if (groupError || !groupId) {
    const status = groupError?.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: groupError?.message ?? "Group not found" }, { status });
  }

  const { data, error } = await adminSupabase
    .from("product_group_products")
    .upsert(
      {
        group_id: groupId,
        product_id: parsed.data.product_id,
        sort_order: parsed.data.sort_order ?? 0,
        is_featured: parsed.data.is_featured ?? false,
      },
      { onConflict: "group_id,product_id" }
    )
    .select(PRODUCT_GROUP_PRODUCT_SELECT)
    .single();

  if (error) {
    console.error("POST /api/product-groups/[id]/products failed", {
      id,
      code: error.code,
      details: error.details,
      hint: error.hint,
      message: error.message,
      payload: parsed.data,
    });

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(mapProductGroupProductRow(data), { status: 201 });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
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

  const { id } = await ctx.params;
  const parsed = productGroupProductUpdateSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  let adminSupabase: SupabaseClient;

  try {
    adminSupabase = createAdminClient();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Server write client is not configured",
      },
      { status: 500 }
    );
  }

  const { groupId, error: groupError } = await fetchGroupId(adminSupabase, id);

  if (groupError || !groupId) {
    const status = groupError?.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: groupError?.message ?? "Group not found" }, { status });
  }

  if (parsed.data.items) {
    const rows = parsed.data.items.map((item) => ({
      group_id: groupId,
      product_id: item.product_id,
      sort_order: item.sort_order,
      ...(item.is_featured === undefined ? {} : { is_featured: item.is_featured }),
    }));

    const { error } = await adminSupabase
      .from("product_group_products")
      .upsert(rows, { onConflict: "group_id,product_id" });

    if (error) {
      console.error("PATCH /api/product-groups/[id]/products reorder failed", {
        id,
        code: error.code,
        details: error.details,
        hint: error.hint,
        message: error.message,
      });

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (!parsed.data.product_id) {
    return NextResponse.json({ error: "product_id is required" }, { status: 400 });
  }

  const updatePayload = {
    ...(parsed.data.sort_order === undefined ? {} : { sort_order: parsed.data.sort_order }),
    ...(parsed.data.is_featured === undefined ? {} : { is_featured: parsed.data.is_featured }),
  };

  const { data, error } = await adminSupabase
    .from("product_group_products")
    .update(updatePayload)
    .eq("group_id", groupId)
    .eq("product_id", parsed.data.product_id)
    .select(PRODUCT_GROUP_PRODUCT_SELECT)
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    console.error("PATCH /api/product-groups/[id]/products failed", {
      id,
      code: error.code,
      details: error.details,
      hint: error.hint,
      message: error.message,
      payload: parsed.data,
    });

    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(mapProductGroupProductRow(data));
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
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

  const { id } = await ctx.params;
  const productId = req.nextUrl.searchParams.get("productId") ?? "";

  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }

  let adminSupabase: SupabaseClient;

  try {
    adminSupabase = createAdminClient();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Server write client is not configured",
      },
      { status: 500 }
    );
  }

  const { groupId, error: groupError } = await fetchGroupId(adminSupabase, id);

  if (groupError || !groupId) {
    const status = groupError?.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: groupError?.message ?? "Group not found" }, { status });
  }

  const { error } = await adminSupabase
    .from("product_group_products")
    .delete()
    .eq("group_id", groupId)
    .eq("product_id", productId);

  if (error) {
    console.error("DELETE /api/product-groups/[id]/products failed", {
      id,
      productId,
      code: error.code,
      details: error.details,
      hint: error.hint,
      message: error.message,
    });

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

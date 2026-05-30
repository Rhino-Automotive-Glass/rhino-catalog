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
import { apiFailure } from "@/lib/api-error-response";

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
    return apiFailure({
      context: "GET /api/product-groups/[id]/products failed",
      error,
      userMessage:
        "Group products could not be loaded. Refresh the page or contact support with the debug ID.",
      log: {
        id,
        groupId,
      },
    });
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
    return NextResponse.json(
      {
        error: "Not authenticated",
        userMessage: "Your session expired. Sign in again before adding products.",
      },
      { status: 401 }
    );
  }

  if (!canManageProductGroups(userRole.role)) {
    return NextResponse.json(
      {
        error: "You do not have permission to manage product groups",
        userMessage: "Your account does not have permission to add products to groups.",
      },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  const parsed = productGroupProductAddSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        userMessage: "The selected product is invalid. Refresh the product picker and try again.",
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
      context: "POST /api/product-groups/[id]/products admin client setup failed",
      error,
      userMessage:
        "The product could not be added because server write access is not configured.",
      log: { id },
    });
  }

  const { groupId, error: groupError } = await fetchGroupId(adminSupabase, id);

  if (groupError || !groupId) {
    const status = groupError?.code === "PGRST116" ? 404 : 500;
    return NextResponse.json(
      {
        error: groupError?.message ?? "Group not found",
        userMessage:
          status === 404
            ? "This product group could not be found. It may have been deleted."
            : "The product group could not be loaded before adding the product.",
      },
      { status }
    );
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
    return apiFailure({
      context: "POST /api/product-groups/[id]/products failed",
      error,
      userMessage:
        "The product could not be added to the group. Please try again or contact support with the debug ID.",
      log: {
        id,
        payload: parsed.data,
      },
    });
  }

  return NextResponse.json(mapProductGroupProductRow(data), { status: 201 });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const userRole = await getUserRole();

  if (!userRole) {
    return NextResponse.json(
      {
        error: "Not authenticated",
        userMessage: "Your session expired. Sign in again before updating group products.",
      },
      { status: 401 }
    );
  }

  if (!canManageProductGroups(userRole.role)) {
    return NextResponse.json(
      {
        error: "You do not have permission to manage product groups",
        userMessage: "Your account does not have permission to update group products.",
      },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  const parsed = productGroupProductUpdateSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        userMessage:
          "The group product update is invalid. Refresh the page and try again.",
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
      context: "PATCH /api/product-groups/[id]/products admin client setup failed",
      error,
      userMessage:
        "Group products could not be updated because server write access is not configured.",
      log: { id },
    });
  }

  const { groupId, error: groupError } = await fetchGroupId(adminSupabase, id);

  if (groupError || !groupId) {
    const status = groupError?.code === "PGRST116" ? 404 : 500;
    return NextResponse.json(
      {
        error: groupError?.message ?? "Group not found",
        userMessage:
          status === 404
            ? "This product group could not be found. It may have been deleted."
            : "The product group could not be loaded before updating products.",
      },
      { status }
    );
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
      return apiFailure({
        context: "PATCH /api/product-groups/[id]/products reorder failed",
        error,
        userMessage:
          "Product order could not be saved. Please refresh and try again, or contact support with the debug ID.",
        log: {
          id,
          itemCount: rows.length,
        },
      });
    }

    return NextResponse.json({ ok: true });
  }

  if (!parsed.data.product_id) {
    return NextResponse.json(
      {
        error: "product_id is required",
        userMessage: "No product was selected. Refresh the page and try again.",
      },
      { status: 400 }
    );
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
    return apiFailure({
      context: "PATCH /api/product-groups/[id]/products failed",
      error,
      status,
      userMessage:
        status === 404
          ? "This product is no longer attached to the group. Refresh the page."
          : "The group product could not be updated. Please try again or contact support with the debug ID.",
      log: {
        id,
        payload: parsed.data,
      },
    });
  }

  return NextResponse.json(mapProductGroupProductRow(data));
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const userRole = await getUserRole();

  if (!userRole) {
    return NextResponse.json(
      {
        error: "Not authenticated",
        userMessage: "Your session expired. Sign in again before removing products.",
      },
      { status: 401 }
    );
  }

  if (!canManageProductGroups(userRole.role)) {
    return NextResponse.json(
      {
        error: "You do not have permission to manage product groups",
        userMessage: "Your account does not have permission to remove products from groups.",
      },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  const productId = req.nextUrl.searchParams.get("productId") ?? "";

  if (!productId) {
    return NextResponse.json(
      {
        error: "productId is required",
        userMessage: "No product was selected to remove. Refresh the page and try again.",
      },
      { status: 400 }
    );
  }

  let adminSupabase: SupabaseClient;

  try {
    adminSupabase = createAdminClient();
  } catch (error) {
    return apiFailure({
      context: "DELETE /api/product-groups/[id]/products admin client setup failed",
      error,
      userMessage:
        "The product could not be removed because server write access is not configured.",
      log: { id, productId },
    });
  }

  const { groupId, error: groupError } = await fetchGroupId(adminSupabase, id);

  if (groupError || !groupId) {
    const status = groupError?.code === "PGRST116" ? 404 : 500;
    return NextResponse.json(
      {
        error: groupError?.message ?? "Group not found",
        userMessage:
          status === 404
            ? "This product group could not be found. It may have been deleted."
            : "The product group could not be loaded before removing the product.",
      },
      { status }
    );
  }

  const { error } = await adminSupabase
    .from("product_group_products")
    .delete()
    .eq("group_id", groupId)
    .eq("product_id", productId);

  if (error) {
    return apiFailure({
      context: "DELETE /api/product-groups/[id]/products failed",
      error,
      userMessage:
        "The product could not be removed from the group. Please try again or contact support with the debug ID.",
      log: {
        id,
        productId,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

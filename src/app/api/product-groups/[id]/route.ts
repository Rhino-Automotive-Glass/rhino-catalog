import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { getUserRole, canManageProductGroups } from "@/lib/roles";
import {
  PRODUCT_GROUP_SELECT,
  isUuid,
  isUniqueViolation,
  mapProductGroupRow,
  resolveUniqueProductGroupSlug,
} from "@/lib/product-group-query";
import { productGroupUpdateSchema } from "@/lib/schemas";
import { apiFailure } from "@/lib/api-error-response";

type RouteContext = { params: Promise<{ id: string }> };

function cleanPayload<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
}

async function fetchGroupByIdentifier(
  supabase: SupabaseClient,
  id: string,
  publishedOnly = false
) {
  let query = supabase.from("product_groups").select(PRODUCT_GROUP_SELECT);

  query = isUuid(id) ? query.eq("id", id) : query.eq("slug", id);

  if (publishedOnly) {
    query = query.eq("status", "published");
  }

  const { data, error } = await query.single();

  if (error) return { data: null, error };

  return { data: mapProductGroupRow(data), error: null };
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const publishedOnly = req.nextUrl.searchParams.get("scope") === "catalog";
  let supabase: SupabaseClient;

  if (publishedOnly) {
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

  const { data, error } = await fetchGroupByIdentifier(supabase, id, publishedOnly);

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const userRole = await getUserRole();

  if (!userRole) {
    return NextResponse.json(
      {
        error: "Not authenticated",
        userMessage: "Your session expired. Sign in again before saving this group.",
      },
      { status: 401 }
    );
  }

  if (!canManageProductGroups(userRole.role)) {
    return NextResponse.json(
      {
        error: "You do not have permission to manage product groups",
        userMessage: "Your account does not have permission to edit product groups.",
      },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  const parsed = productGroupUpdateSchema.safeParse(await req.json());

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
      context: "PATCH /api/product-groups/[id] admin client setup failed",
      error,
      userMessage:
        "Product group changes could not be saved because server write access is not configured.",
      log: { id },
    });
  }

  const matchColumn = isUuid(id) ? "id" : "slug";
  const updatePayload = cleanPayload(parsed.data);
  const requestedSlug =
    typeof updatePayload.slug === "string" ? updatePayload.slug : undefined;
  let currentGroupId: string | undefined;

  if (requestedSlug) {
    const { data: currentGroup, error: currentError } = await fetchGroupByIdentifier(
      adminSupabase,
      id
    );

    if (currentError) {
      const status = currentError.code === "PGRST116" ? 404 : 500;
      return NextResponse.json(
        {
          error: currentError.message,
          userMessage:
            status === 404
              ? "This product group could not be found. It may have been deleted."
              : "The product group could not be loaded before saving. Please try again.",
        },
        { status }
      );
    }

    currentGroupId = currentGroup?.id;

    try {
      updatePayload.slug = await resolveUniqueProductGroupSlug(
        adminSupabase,
        requestedSlug,
        currentGroupId
      );
    } catch (slugError) {
      return apiFailure({
        context: "PATCH /api/product-groups/[id] slug generation failed",
        error: slugError,
        userMessage:
          "A unique group URL could not be generated. Please adjust the group name or vehicle fields and try again.",
        log: { id, requestedSlug },
      });
    }
  }

  let data = null;
  let error = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await adminSupabase
      .from("product_groups")
      .update(updatePayload)
      .eq(matchColumn, id)
      .select(PRODUCT_GROUP_SELECT)
      .single();

    data = result.data;
    error = result.error;

    if (!error || !isUniqueViolation(error) || !requestedSlug) break;

    try {
      updatePayload.slug = await resolveUniqueProductGroupSlug(
        adminSupabase,
        requestedSlug,
        currentGroupId
      );
    } catch (slugError) {
      return apiFailure({
        context: "PATCH /api/product-groups/[id] slug retry failed",
        error: slugError,
        userMessage:
          "A unique group URL could not be generated. Please adjust the group name or vehicle fields and try again.",
        log: { id, requestedSlug },
      });
    }
  }

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return apiFailure({
      context: "PATCH /api/product-groups/[id] failed",
      error,
      status,
      userMessage:
        status === 404
          ? "This product group could not be found. It may have been deleted."
          : "The product group changes could not be saved. Please try again or contact support with the debug ID.",
      log: {
        id,
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

  return NextResponse.json(mapProductGroupRow(data));
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const userRole = await getUserRole();

  if (!userRole) {
    return NextResponse.json(
      {
        error: "Not authenticated",
        userMessage: "Your session expired. Sign in again before deleting this group.",
      },
      { status: 401 }
    );
  }

  if (!canManageProductGroups(userRole.role)) {
    return NextResponse.json(
      {
        error: "You do not have permission to manage product groups",
        userMessage: "Your account does not have permission to delete product groups.",
      },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  let adminSupabase: SupabaseClient;

  try {
    adminSupabase = createAdminClient();
  } catch (error) {
    return apiFailure({
      context: "DELETE /api/product-groups/[id] admin client setup failed",
      error,
      userMessage:
        "Product group could not be deleted because server write access is not configured.",
      log: { id },
    });
  }

  const matchColumn = isUuid(id) ? "id" : "slug";
  const { error } = await adminSupabase.from("product_groups").delete().eq(matchColumn, id);

  if (error) {
    return apiFailure({
      context: "DELETE /api/product-groups/[id] failed",
      error,
      userMessage:
        "The product group could not be deleted. Please try again or contact support with the debug ID.",
      log: {
        id,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

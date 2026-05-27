import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { getUserRole, canManageProductGroups } from "@/lib/roles";
import {
  PRODUCT_GROUP_SELECT,
  isUuid,
  mapProductGroupRow,
} from "@/lib/product-group-query";
import { productGroupUpdateSchema } from "@/lib/schemas";

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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!canManageProductGroups(userRole.role)) {
    return NextResponse.json(
      { error: "You do not have permission to manage product groups" },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  const parsed = productGroupUpdateSchema.safeParse(await req.json());

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

  const matchColumn = isUuid(id) ? "id" : "slug";
  const { data, error } = await adminSupabase
    .from("product_groups")
    .update(cleanPayload(parsed.data))
    .eq(matchColumn, id)
    .select(PRODUCT_GROUP_SELECT)
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    console.error("PATCH /api/product-groups/[id] failed", {
      id,
      code: error.code,
      details: error.details,
      hint: error.hint,
      message: error.message,
      payload: parsed.data,
    });

    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(mapProductGroupRow(data));
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
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

  const matchColumn = isUuid(id) ? "id" : "slug";
  const { error } = await adminSupabase.from("product_groups").delete().eq(matchColumn, id);

  if (error) {
    console.error("DELETE /api/product-groups/[id] failed", {
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

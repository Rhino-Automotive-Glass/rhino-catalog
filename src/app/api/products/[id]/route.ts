import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { z } from "zod";
import { productFormSchema, productImagesSchema } from "@/lib/schemas";
import { getUserRole, canEditProducts, canEditImages } from "@/lib/roles";
import { mapProductRow, PRODUCT_WITH_SOURCE_INNER_SELECT } from "@/lib/product-query";
import { apiFailure } from "@/lib/api-error-response";

type RouteContext = { params: Promise<{ id: string }> };

async function fetchProductByIdentifier(id: string) {
  const supabase = await createClient();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const query = supabase
    .from("products")
    .select(PRODUCT_WITH_SOURCE_INNER_SELECT);

  const { data, error } = await (
    isUuid
      ? query.eq("id", id)
      : query.eq("product_codes.product_code_data->>generated", id)
  ).single();

  if (error) {
    return { data: null, error };
  }

  return {
    data: mapProductRow(data),
    error: null,
  };
}

/** GET /api/products/[id] — fetch a single product by id or product code */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { data, error } = await fetchProductByIdentifier(id);

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json(
      {
        error: error.message,
        userMessage:
          status === 404
            ? "This product could not be found. It may have been removed or resynced."
            : "The product could not be loaded. Please try again.",
      },
      { status }
    );
  }

  return NextResponse.json(data);
}

/** PATCH /api/products/[id] — update a product (role-gated) */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const userRole = await getUserRole();

  if (!userRole) {
    return NextResponse.json(
      {
        error: "Not authenticated",
        userMessage: "Your session expired. Sign in again before saving this product.",
      },
      { status: 401 }
    );
  }

  if (!canEditImages(userRole.role)) {
    return NextResponse.json(
      {
        error: "You do not have permission to edit products",
        userMessage: "Your account does not have permission to edit products.",
      },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  const body = await req.json();
  const { data: product, error: productError } = await fetchProductByIdentifier(id);
  let adminSupabase;

  try {
    adminSupabase = createAdminClient();
  } catch (error) {
    return apiFailure({
      context: "PATCH /api/products/[id] admin client setup failed",
      error,
      userMessage:
        "Product changes could not be saved because server write access is not configured.",
      log: {
        id,
        role: userRole.role,
      },
    });
  }

  if (productError) {
    const status = productError.code === "PGRST116" ? 404 : 500;
    return NextResponse.json(
      {
        error: productError.message,
        userMessage:
          status === 404
            ? "This product could not be found. It may have been removed or resynced."
            : "The product could not be loaded before saving. Please try again.",
      },
      { status }
    );
  }

  if (!product) {
    return NextResponse.json(
      {
        error: "Product not found",
        userMessage: "This product could not be found. It may have been removed or resynced.",
      },
      { status: 404 }
    );
  }

  if (!Array.isArray(product.images)) {
    return apiFailure({
      context: "PATCH /api/products/[id] blocked by legacy images schema",
      error: new Error("Legacy product images schema is still active"),
      userMessage:
        "Product images cannot be saved until the product image database migration is applied.",
      log: {
        id,
        role: userRole.role,
        imagesType: typeof product.images,
        imagesValue: product.images,
      },
    });
  }

  if (product.is_hidden) {
    return NextResponse.json(
      {
        error: product.hidden_reason ?? "Hidden products are read-only in this app",
        userMessage:
          "This product is hidden by catalog rules and cannot be edited from the admin app.",
      },
      { status: 403 }
    );
  }

  // Editors: can only update images
  if (!canEditProducts(userRole.role)) {
    if (!body.images) {
      return NextResponse.json(
        {
          error: "Editors can only update product images",
          userMessage: "Your role can only update product images.",
        },
        { status: 403 }
      );
    }

    const imagesParsed = productImagesSchema.safeParse(body.images);
    if (!imagesParsed.success) {
      return NextResponse.json(
        {
          error: "Invalid images data",
          userMessage:
            "The selected image data is invalid. Remove the image and upload it again.",
          details: imagesParsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { error } = await adminSupabase
      .from("products")
      .update({ images: imagesParsed.data })
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      return apiFailure({
        context: "PATCH /api/products/[id] image update failed",
        error,
        userMessage:
          "The product image could not be saved. Please try again or contact support with the debug ID.",
        log: {
          id,
          role: userRole.role,
          images: imagesParsed.data,
        },
      });
    }

    const { data, error: fetchError } = await fetchProductByIdentifier(id);

    if (fetchError) {
      const status = fetchError.code === "PGRST116" ? 404 : 500;
      return NextResponse.json(
        {
          error: fetchError.message,
          userMessage:
            "The image was saved, but the updated product could not be reloaded. Refresh the page.",
        },
        { status }
      );
    }

    return NextResponse.json(data);
  }

  // Admin / super_admin: only catalog-owned fields are editable here
  const editableSchema = z
    .object({
      price: productFormSchema.shape.price,
      stock: productFormSchema.shape.stock,
      status: productFormSchema.shape.status,
      images: productImagesSchema,
    })
    .partial();

  const parsed = editableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        userMessage:
          "Some product fields are invalid. Check price, stock, status, and image values.",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }
  const { error: updateError } = await adminSupabase
    .from("products")
    .update(parsed.data)
    .eq("id", id);

  if (updateError) {
    return apiFailure({
      context: "PATCH /api/products/[id] product update failed",
      error: updateError,
      userMessage:
        "The product changes could not be saved. Please try again or contact support with the debug ID.",
      log: {
        id,
        role: userRole.role,
        payload: parsed.data,
      },
    });
  }

  const { data, error } = await fetchProductByIdentifier(id);

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json(
      {
        error: error.message,
        userMessage:
          "The product was saved, but the updated product could not be reloaded. Refresh the page.",
      },
      { status }
    );
  }

  return NextResponse.json(data);
}

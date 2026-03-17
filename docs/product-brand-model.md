# Product Brand Model

## Overview

The catalog moved from a denormalized product-brand model to a normalized one.

Previously, the app treated brand data as product-owned text fields:

- `products.brand`
- `products.brands`

That shape was ambiguous because the app needed two different concepts:

1. One primary brand for catalog browsing
2. Optional additional brands for rare multi-brand edge cases

The old model mixed those concepts together and made it easy for the data to drift.

The new model separates them clearly:

- `brands` is the canonical brand table
- `product_brands` stores every product-to-brand membership
- `products.primary_brand_id` stores the single primary brand used for browsing

## Why We Changed It

The old model had a few structural problems:

- `brand` and `brands` could disagree
- the admin UI mostly edited a single brand, while the type system also implied multi-brand support
- catalog filtering had no clean way to represent "primary brand" versus "also belongs to"
- free-text brand editing made duplicates and spelling drift more likely

The new model fixes that by making brand membership relational and explicit.

## Database Changes

The schema changes were introduced in:

- `supabase/migrations/202603170001_normalize_product_brands.sql`
- `supabase/migrations/202603170002_brand_access_policies.sql`

### `brands`

`brands` is now the canonical source of truth for brand identity.

It stores one row per brand:

- `id uuid`
- `name text`
- timestamps

Important details:

- A normalized-name index prevents duplicate brands that differ only by case or spacing.
- Products no longer own the brand name directly as free text.
- Any future brand management should create or edit rows here, not in `products`.

Conceptually:

- one brand row can be linked to many products
- product-facing UIs should display `brands.name`
- filtering and browsing should key off `brands.id`, not the raw name

### `product_brands`

`product_brands` is the membership table between products and brands.

It stores every valid brand association for a product:

- `product_id`
- `brand_id`
- timestamp

Important details:

- Its primary key is `(product_id, brand_id)`, so duplicate memberships are not allowed.
- It represents the full set of brand memberships for a product.
- Multi-brand products are modeled by having more than one row in this table.

Conceptually:

- a normal single-brand product will have exactly one `product_brands` row
- a multi-brand product will have multiple `product_brands` rows
- this table answers the question: "Which brands does this product belong to at all?"

### `products.primary_brand_id`

`products.primary_brand_id` is the single primary brand for the product.

It is not a replacement for `product_brands`; it is the browsing anchor.

Important details:

- It points to `brands.id`
- it is also required to exist inside `product_brands`
- published products must have it

Conceptually:

- this answers the question: "Which brand should this product appear under by default?"
- it is used for catalog grouping and browsing
- additional brands remain valid memberships, but they do not replace the primary browsing brand

### Invariants

The normalized model depends on these rules:

1. Every product can have zero or more brand memberships in `product_brands`
2. Published products must have a non-null `primary_brand_id`
3. The primary brand must also exist as a membership in `product_brands`
4. Duplicate product-brand memberships are not allowed

These rules are enforced by the schema plus the write function described below.

## Write Path

The database function `set_product_brands(...)` is the canonical write path for product-brand membership changes.

Its purpose is to update:

- the full brand membership set in `product_brands`
- the single primary brand in `products.primary_brand_id`

in one database-side operation.

This is important because once the model became relational, brand changes stopped being a simple single-column update.

The app calls this function from:

- `src/app/api/products/[id]/route.ts`

That route validates the payload, computes:

- `primary_brand_id`
- `additional_brand_ids`

and then uses the RPC function to keep the relationship tables in sync.

## Read Model in the App

The app no longer reads raw text brand fields from `products`.

Instead, API routes build a read model that returns:

- `primary_brand`
- `primary_brand_id`
- `additional_brands`

The shared mapping logic lives in:

- `src/lib/product-query.ts`

That mapper:

- joins `products` to the primary `brands` row
- joins `products` to all `product_brands`
- removes the primary brand from the additional-brand list
- deduplicates the additional-brand list

This gives the UI a clean shape without forcing React components to know about the raw join structure.

## Access and Policies

After introducing `brands` and `product_brands`, the app also needed access policies for them.

That was added in:

- `supabase/migrations/202603170002_brand_access_policies.sql`

This migration:

- grants `select` on `brands` and `product_brands`
- grants execute on `set_product_brands(...)`
- enables RLS on the new brand tables
- adds public read policies for brand browsing

Without these policies, the catalog and product routes can fail even if the schema itself exists.

## App-Level Changes

### Catalog

`/catalog` now reads products through the normalized model.

Instead of relying on a product-owned brand string, it now:

- loads primary brands from `/api/brands`
- filters products using `primaryBrandId`
- renders the primary brand as the main brand label
- optionally shows `additional_brands` as secondary information

Relevant file:

- `src/app/catalog/page.tsx`

### Admin Product Editor

The product editor stopped using a free-text brand input.

It now uses:

- one selector for the primary brand
- one multiselect for additional brands

Relevant files:

- `src/app/admin/products/[id]/page.tsx`
- `src/components/brand-multi-select.tsx`

This matches the data model directly:

- `primary_brand_id` for the catalog-owned primary brand
- `additional_brand_ids` for optional edge-case memberships

### Admin Product List

The admin product list now filters by primary brand instead of a loose text search on the old brand string.

Relevant file:

- `src/app/admin/products/page.tsx`

## Migrations and Backfill

The normalization migration backfilled existing data from the old columns:

- `products.brand`
- `products.brands`

It used those values to:

- seed `brands`
- populate `product_brands`
- infer `products.primary_brand_id`

After the backfill, the old product-owned brand columns were removed.

That matters because the app now depends fully on the relational model.

## Current Behavior

The current intended behavior is:

- every product can belong to one or more brands
- every product can have one primary brand
- the catalog uses the primary brand as the main browsing concept
- additional brands exist for edge cases, compatibility, and secondary membership

This gives a clear answer to both of these questions:

- "Which brand owns this product for browsing?" -> `products.primary_brand_id`
- "Which brands can this product belong to at all?" -> `product_brands`

## Future Improvements

The normalized model is in place, but a few follow-ups may still be useful:

1. Add a dedicated brand management screen
2. Add stronger operational docs around RLS policies for new tables
3. Decide whether catalog browsing should show only primary-brand placement or also expose an "any brand membership" mode
4. Add automated tests around:
   - primary-brand enforcement
   - multi-brand editing
   - catalog filtering by primary brand
   - API read-model mapping

## Summary

The product-brand system is now intentionally split into three responsibilities:

- `brands` defines what a brand is
- `product_brands` defines all valid product-brand memberships
- `products.primary_brand_id` defines the single default brand for browsing

That separation is the core improvement. It removes ambiguity, supports the common single-brand case cleanly, and still handles the rare multi-brand product correctly.

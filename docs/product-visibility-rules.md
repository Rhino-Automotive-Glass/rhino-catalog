# Product Visibility Rules

## Overview

The catalog now has a visibility-rules layer that can hide products automatically based on source data coming from Rhino Code.

The first rule is:

- hide any product whose `product_codes.product_code_data.parte` is `"s"`

When this rule matches, the product is treated as:

- hidden from `/catalog`
- shown as `hidden` in `/admin/products`
- read-only in `/admin/products/[id]`

This behavior is derived from source data. It is not stored as a separate editable status in the `products` table.

## Why It Works This Way

This app is App B in a one-way data flow:

- Rhino Code is the source of truth for source product data
- Rhino Catalog mirrors that data and adds catalog-owned fields like price, stock, status, and images

Because the hide rule depends on source data, the safest design is to derive it at read time instead of persisting another status in App B.

That avoids a few problems:

- App B and Rhino Code cannot drift on whether a product should be hidden
- admins cannot accidentally unhide a source-hidden product
- adding new hide rules does not require rewriting product rows

## Rule Definition

The rule lives in:

- `src/lib/product-visibility.ts`

Current rule:

- `product_code_data.parte`
- trim whitespace
- lowercase the value
- if the result is `"s"`, the product is hidden

In code terms, the rule is checked against `product.product_codes.product_code_data.parte`.

## Derived Fields

When a product row is mapped in:

- `src/lib/product-query.ts`

the app now adds these derived fields:

- `is_hidden`
- `hidden_reason`
- `effective_status`

### `is_hidden`

Boolean flag used by the UI and API to decide whether the product should be excluded or locked.

### `hidden_reason`

Human-readable explanation of why the product was hidden.

Current reason:

- `Hidden because Rhino Code marks product_code_data.parte as "s".`

### `effective_status`

This is the display status for the product.

Rules:

1. If the product matches a hide rule, `effective_status = "hidden"`
2. Otherwise, `effective_status = products.status`

This means the stored DB status still exists (`draft`, `published`, `archived`), but the app shows `hidden` whenever a visibility rule overrides it.

## Where the Rule Is Applied

### Catalog Products

Route:

- `src/app/api/products/route.ts`

Behavior:

- catalog requests use `visibility=visible`
- hidden products are filtered out before results are returned
- this applies to brand filtering, submodel filtering, and pagination counts

Result:

- hidden products never show in `/catalog`

### Catalog Brand Grid

Route:

- `src/app/api/brands/route.ts`

Behavior:

- brand counts for `scope=catalog` are computed from visible products only
- hidden products do not contribute to brand counts

Result:

- brands only appear in the catalog grid if they have at least one visible product

### Admin Product List

Page:

- `src/app/admin/products/page.tsx`

Behavior:

- admin requests use `visibility=all`
- hidden products stay visible in the list
- the status column renders `effective_status`
- the status filter now includes `hidden`

Result:

- admins can still find hidden products, but they are clearly labeled as hidden

### Admin Product Detail

Page:

- `src/app/admin/products/[id]/page.tsx`

Behavior:

- hidden products show a `hidden` badge
- a warning explains that the product is hidden automatically from the catalog
- the source-data area shows the visibility rule reason
- all editing is disabled for hidden products, including images

Result:

- hidden products are inspectable but not editable

### API Write Protection

Route:

- `src/app/api/products/[id]/route.ts`

Behavior:

- before any PATCH update is applied, the route loads the product
- if the product is hidden, the route returns `403`

Result:

- even if someone bypasses the UI, hidden products cannot be edited through the API

## Important Design Choice

The hidden state is not written into the database as a new status value.

That was intentional.

Why:

- `hidden` is not a catalog-owned workflow state like `draft` or `published`
- it is a visibility override caused by source data
- persisting it in `products.status` would mix source-driven rules with manual catalog workflow

So the model is:

- `products.status` remains the stored workflow status
- `effective_status` is the UI/API status after visibility rules are applied

## How To Add More Rules Later

New rules should be added in:

- `src/lib/product-visibility.ts`

Recommended pattern:

1. Add a new rule object to `hiddenProductRules`
2. Give it a stable `id`
3. Add a readable `reason`
4. Implement `matches(...)` using source data from `ProductCode`

As soon as a rule is added there, the rest of the app will pick it up automatically through the shared mapping layer.

That includes:

- catalog visibility
- brand counts
- admin status display
- admin edit lockout
- API PATCH protection

## Operational Notes

- No database migration was required for this feature
- the rule is computed in the app layer from joined `product_codes` data
- if Rhino Code changes the source value, the hidden state changes automatically the next time the product is read

## Current Rule Summary

Today, a product is hidden when:

- `product_codes.product_code_data.parte === "s"` after trim/lowercase normalization

Effect:

- hidden from catalog
- visible as `hidden` in admin
- non-editable in admin and API

# Product Groups Feature

## Overview

Product Groups are curated product collections for vehicle applications.

Examples:

- Ford Transit 110 2015-2024
- Toyota HiAce 2020-2024
- Nissan NV350 2013-2024

They are intentionally separate from products, brands, categories, tags, and Rhino Code source-managed fields. A group is catalog-owned metadata plus a join table of products.

Use Product Groups when the catalog needs a curated vehicle/application landing page that contains multiple products.

Do not use Product Groups to change product source data.

## Core Concepts

### Product Group

A Product Group represents one customer-facing vehicle/application page.

Important fields:

- `slug`: hidden from admins; generated automatically
- `name`: admin-facing and customer-facing title
- `description`: optional customer-facing copy
- `images`: optional, 0 to 3 images
- `brand_id`: optional vehicle brand reference
- `sub_model`: vehicle/submodel label, such as `NV350` or `HiAce`
- `year_start`, `year_end`: optional year range
- `status`: `draft`, `published`, or `archived`; new groups default to `published`
- `sort_order`: public/admin ordering hint

The old group-level `model` field is now deprecated and nullable. It should stay `null` for new writes. We removed it from the UI because the project data commonly used product `model` as a year, and Product Groups already have explicit year fields.

### Product Membership

Products are attached to groups through `product_group_products`.

This join table stores:

- `group_id`
- `product_id`
- `sort_order`
- `is_featured`
- `created_at`

Product membership must stay relational. Do not store product IDs in JSON arrays or comma-separated strings.

## Database

Main migrations:

- `supabase/migrations/202605240001_product_groups.sql`
- `supabase/migrations/202605240002_product_group_access_policies.sql`
- `supabase/migrations/202605240003_product_group_images.sql`
- `supabase/migrations/202605240004_product_group_description.sql`
- `supabase/migrations/202605260001_make_product_group_images_optional.sql`
- `supabase/migrations/202605270001_make_product_group_model_optional.sql`

Tables:

- `public.product_groups`
- `public.product_group_products`

Access model:

- Public/catalog reads use normal Supabase clients and RLS.
- Admin writes use the service-role admin client from API routes.
- Public RLS select access is restricted to published groups and their products.

Important constraints:

- `product_groups.slug` is unique and nonblank.
- `product_groups.name` is nonblank.
- `product_groups.images` allows 0 to 3 image paths/URLs.
- `product_groups.model` is nullable and deprecated.
- `product_groups.year_start <= year_end` when both are present.
- `product_group_products` has primary key `(group_id, product_id)`.

## Slug Behavior

Admins do not edit slugs directly.

The admin form generates slugs from:

1. vehicle brand
2. vehicle/submodel
3. year range

If those fields are incomplete, it falls back to the group name.

For existing groups, the slug is not silently regenerated just by opening the page. It only changes when slug-driving fields are edited.

Slug logic lives in:

- `src/app/admin/product-groups/[id]/page.tsx`

The API is authoritative for uniqueness. Create/update routes resolve hidden slug
collisions by keeping the generated base when available, otherwise appending a
numeric suffix such as `ford-transit-2015-2024-2`. This is necessary because
admins do not edit slugs directly.

## Images

Group images are optional.

Rules:

- minimum: 0
- maximum: 3
- accepted values: app-local paths such as `/uploads/products/...` or supported URLs

Local development upload fallback stores files under:

- `public/uploads/products/...`

The Next image config allows those paths through:

- `next.config.ts`

Rendering code uses `getCatalogImageSrc(...)`, which falls back to `/rhino-logo.png` when no image exists.

Shared image helper:

- `src/lib/catalog-image.ts`

Uploader component:

- `src/components/image-upload.tsx`

## Shared Types And Validation

Shared types:

- `src/lib/types.ts`

Zod schemas:

- `src/lib/schemas.ts`

Key schemas:

- `productGroupFormSchema`
- `productGroupCreateSchema`
- `productGroupUpdateSchema`
- `productGroupImagesSchema`
- `productGroupProductAddSchema`
- `productGroupProductUpdateSchema`

Important validation behavior:

- `images` may be empty.
- `model` may be null.
- `status` must be `draft`, `published`, or `archived`.
- `year_start` must be before or equal to `year_end` when both exist.

## Query Helpers

Product Group read models and suggestion logic live in:

- `src/lib/product-group-query.ts`

This file provides:

- Supabase select strings
- row mappers
- group search filter builder
- slug/label helpers
- suggestion scoring and reasons

The mapper returns a frontend-friendly `ProductGroup` shape with the joined brand relation normalized.

## API Routes

Product Group routes:

- `GET /api/product-groups`
- `POST /api/product-groups`
- `GET /api/product-groups/[id-or-slug]`
- `PATCH /api/product-groups/[id-or-slug]`
- `DELETE /api/product-groups/[id-or-slug]`

Product membership routes:

- `GET /api/product-groups/[id-or-slug]/products`
- `POST /api/product-groups/[id-or-slug]/products`
- `PATCH /api/product-groups/[id-or-slug]/products`
- `DELETE /api/product-groups/[id-or-slug]/products?productId=...`

Suggestion route:

- `GET /api/product-groups/[id-or-slug]/suggestions`

Files:

- `src/app/api/product-groups/route.ts`
- `src/app/api/product-groups/[id]/route.ts`
- `src/app/api/product-groups/[id]/products/route.ts`
- `src/app/api/product-groups/[id]/suggestions/route.ts`

Admin-only routes check the user role with:

- `src/lib/roles.ts`

## Admin UI

Admin pages:

- `/admin/product-groups`
- `/admin/product-groups/[id]`
- `/admin/product-groups/new`

Files:

- `src/app/admin/product-groups/page.tsx`
- `src/app/admin/product-groups/[id]/page.tsx`

The list page supports:

- search
- status filter
- pagination
- image thumbnail fallback
- links to edit pages

The create/edit page supports:

- name
- description
- optional group images
- vehicle brand
- vehicle/submodel
- year range
- status
- sort order
- product membership
- featured toggle
- manual product ordering
- deleting a group

New groups default to `published`.

The slug field is always hidden and generated automatically.

## Product Picker Modal

The group editor has an Add Products modal.

It mirrors `/admin/products` and adds multi-select checkboxes.

The modal supports:

- code/description search
- primary brand filter
- status filter
- submodel filter
- pagination
- selecting multiple products
- adding selected products to the group

When creating a new group, selected products are staged in local form state and attached only after the group record is created.

When editing an existing group, selected products are written immediately through the group products API.

The modal uses `/api/products` with:

- `visibility=all`
- `search`
- `primaryBrandId`
- `status`
- `subModel`

Brand options for this modal must use:

- `/api/brands?scope=primary`

Do not use the full vehicle brand list here, because the products API filter is `primaryBrandId`.

## Suggestions

Suggestions appear only on existing saved groups.

They were introduced with the original Product Groups work because the feature needed to suggest matching products based on group vehicle data and `product_codes.compatibility_data`.

Suggestion flow:

1. Admin page calls `/api/product-groups/[id]/suggestions`.
2. API loads the group.
3. API loads candidate products, narrowed by group brand when present.
4. API excludes hidden products.
5. API excludes products already in the group.
6. API scores candidates and returns the top matches.

Current scoring:

- `+40` for brand match
- `+45` for vehicle/submodel match
- `+15` for year overlap

A score of `0` means the product is not suggested.

Suggestion matching checks product fields and source compatibility data:

- product primary/additional brands
- product `subModel`
- `product_codes.compatibility_data.items[].marca`
- `product_codes.compatibility_data.items[].subModelo`
- `product_codes.compatibility_data.items[].version`
- `product_codes.compatibility_data.items[].additional`
- `product_codes.compatibility_data.generated`
- display year/description year text

The suggestion area is blocked while adding a suggestion so users cannot double-click and send duplicate add requests.

Implementation:

- `src/app/api/product-groups/[id]/suggestions/route.ts`
- `src/lib/product-group-query.ts`
- `src/app/admin/product-groups/[id]/page.tsx`

## Catalog UI

Catalog route:

- `/catalog`

The catalog has two tabs:

- Brand
- Vehicle

Vehicle tab behavior:

- loads published Product Groups
- renders cards with image fallback
- links to slug detail pages

Group detail route:

- `/catalog/groups/[slug]`

Group detail page shows:

- brand
- group name
- vehicle/submodel and years
- optional description
- optional image gallery
- products in group
- featured badges

Files:

- `src/app/catalog/CatalogClient.tsx`
- `src/app/catalog/groups/page.tsx`
- `src/app/catalog/groups/[slug]/page.tsx`

`/catalog/groups` redirects to `/catalog?tab=vehicle`.

## Navigation

The shared top navigation lives in:

- `src/components/app-header.tsx`

It is used across catalog and admin surfaces so navigation stays visible when users move between catalog pages and admin pages.

Top-level areas:

- Catalog
- Products
- Groups

## Source-Managed Fields

Product Groups must not repurpose or mutate source-managed product fields.

Source data still comes from `product_codes`, especially:

- `product_code_data`
- `description_data`
- `compatibility_data`

Product Groups may read compatibility data for suggestions, but they do not write to it.

## Operational Notes

Some migrations in this feature were applied remotely through the Supabase Management API because `supabase db push` was blocked by remote migration-history entries that were not present locally.

Future maintainers should be careful before running migration repair commands. Prefer understanding remote migration history first.

The local development upload fallback depends on app-local paths under:

- `public/uploads/products`

Production blob uploads still require the Vercel Blob token.

## Common Future Changes

If adding more group metadata:

1. Add a migration.
2. Update `src/lib/types.ts`.
3. Update `src/lib/schemas.ts`.
4. Update `PRODUCT_GROUP_SELECT` and `mapProductGroupRow`.
5. Update admin create/edit UI.
6. Update catalog display if customer-facing.

If changing suggestion behavior:

1. Update `getProductGroupSuggestionScore`.
2. Update `getProductGroupSuggestionReason`.
3. Update the admin helper text if the visible criteria changed.
4. Verify hidden products and already-added products remain excluded.

If changing image behavior:

1. Update DB image count constraint.
2. Update `productGroupImagesSchema`.
3. Check all `group.images[0]` render sites use `getCatalogImageSrc`.
4. Verify `next.config.ts` allows any new local image path.

## Verification Commands Used During Development

Common checks:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Additional smoke checks used during development:

- browser checks for `/admin/product-groups/new`
- browser checks for `/admin/product-groups/[id]`
- browser checks for `/catalog?tab=vehicle`
- browser checks for `/catalog/groups/[slug]`
- API smoke tests against `/api/product-groups`
- API smoke tests against `/api/upload`

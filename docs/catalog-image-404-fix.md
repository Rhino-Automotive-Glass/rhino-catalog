# Catalog image 404 issue and fix

## Summary

Some catalog products, including several Toyota records, were returning image `404` errors even though the product row still contained an image URL.

The visible symptom was:

- the catalog tried to render a product image
- the stored Vercel Blob URL returned `404`
- the browser console showed broken image requests
- some products appeared without their expected image

## Root cause

The problem was caused by the admin image editing flow in `rhino-catalog`.

Before this fix, replacing or removing an image behaved like this:

1. The old blob was deleted immediately from Vercel Blob.
2. The new image URL was only held in local form state.
3. The database record was not updated until the user clicked `Save`.

If the user left the page, refreshed, lost connection, or the save failed after step 1, the product row still pointed to the old URL even though that blob had already been deleted. That left a stale URL in `products.images`, which later produced `404` errors in the catalog.

## Fix applied in this project

The image workflow now uses deferred cleanup:

1. Upload the replacement image first.
2. Keep the old image URL in a pending deletion queue.
3. Save the updated `images` field to the product record.
4. Only after a successful save, delete the old blob if it is no longer referenced.

This change lives in:

- `src/components/image-upload.tsx`
- `src/app/admin/products/[id]/page.tsx`
- `src/app/api/products/[id]/route.ts`

## Additional protection

This project now also serves catalog images through a local proxy route:

- `src/app/api/catalog-image/route.ts`
- `src/lib/catalog-image.ts`

That route:

- accepts only approved Vercel Blob image URLs
- fetches the remote image server-side
- falls back to `/rhino-logo.png` if the blob is missing or invalid

This prevents stale blob URLs from surfacing as raw broken image requests in the browser UI.

## Important operational note

This fix prevents new stale-image incidents caused by the previous save flow.

It does **not** automatically restore already-broken records. Products whose stored blob URLs already point to deleted files still need one of these follow-up actions:

- re-upload the correct image in the admin UI and save the product
- or update the `products.images` value to a valid blob URL
- or leave the product with no image so the fallback logo is shown intentionally

## Related project

The consumer-facing landing app also received the safe image proxy fallback so existing stale URLs fail gracefully there as well:

- `/Users/bersoriano/dev/rhino-landing-catalog/docs/catalog-image-404-fix.md`

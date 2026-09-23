-- Already applied to production 2026-09-19 via rhino-product-code-description 010/013. Recorded here to prevent regressions.
-- Source of truth: live public functions and pg_policy on project uzgomevojvzdzfunjhdr.
-- ALTER FUNCTION preserves production function bodies and EXECUTE grants.
-- Any future CREATE OR REPLACE of these functions must also set search_path = ''.

ALTER FUNCTION public.normalize_brand_name(text) SET search_path = '';
ALTER FUNCTION public.set_product_brands(uuid, uuid, uuid[]) SET search_path = '';
ALTER FUNCTION public.prevent_source_managed_product_field_updates() SET search_path = '';
ALTER FUNCTION public.set_updated_at() SET search_path = '';
ALTER FUNCTION public.touch_catalog_on_source_change() SET search_path = '';

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_brands ENABLE ROW LEVEL SECURITY;

-- Remove policies from older, locally recorded migrations if replayed on a new database.
DROP POLICY IF EXISTS "brands_select_public" ON public.brands;
DROP POLICY IF EXISTS "product_brands_select_public" ON public.product_brands;
DROP POLICY IF EXISTS "product_brands_manage_authenticated" ON public.product_brands;

DROP POLICY IF EXISTS "Catalog is publicly readable" ON public.brands;
CREATE POLICY "Catalog is publicly readable"
ON public.brands FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Catalog is publicly readable" ON public.product_brands;
CREATE POLICY "Catalog is publicly readable"
ON public.product_brands FOR SELECT TO anon, authenticated USING (true);

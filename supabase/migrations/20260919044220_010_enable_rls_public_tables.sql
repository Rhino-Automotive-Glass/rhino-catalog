DROP POLICY IF EXISTS "Allow public insert" ON public.product_codes;
DROP POLICY IF EXISTS "Allow public update" ON public.product_codes;
DROP POLICY IF EXISTS "Allow public delete" ON public.product_codes;

DROP POLICY IF EXISTS "Editors can create product codes" ON public.product_codes;
CREATE POLICY "Editors can create product codes"
ON public.product_codes FOR INSERT TO authenticated
WITH CHECK ((SELECT public.current_user_hierarchy_level()) >= 60);

ALTER TABLE public.brands         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Catalog is publicly readable" ON public.brands;
CREATE POLICY "Catalog is publicly readable"
ON public.brands FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Catalog is publicly readable" ON public.product_brands;
CREATE POLICY "Catalog is publicly readable"
ON public.product_brands FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous read"   ON public.tasks;
DROP POLICY IF EXISTS "Allow anonymous insert" ON public.tasks;
DROP POLICY IF EXISTS "Allow anonymous update" ON public.tasks;
DROP POLICY IF EXISTS "Allow anonymous delete" ON public.tasks;

REVOKE ALL ON public.product_stock FROM anon;
REVOKE ALL ON public.tasks         FROM anon;

DROP POLICY IF EXISTS "Authenticated users can access stock" ON public.product_stock;
CREATE POLICY "Authenticated users can access stock"
ON public.product_stock FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can access tasks" ON public.tasks;
CREATE POLICY "Authenticated users can access tasks"
ON public.tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);;

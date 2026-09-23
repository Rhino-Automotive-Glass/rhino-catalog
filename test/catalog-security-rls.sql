\set ON_ERROR_STOP on

-- Run only against a disposable local PostgreSQL database:
-- psql -h 127.0.0.1 -p 55432 -U postgres -d postgres -f test/catalog-security-rls.sql
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE public.brands (
  id uuid PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE public.product_brands (
  product_id uuid NOT NULL,
  brand_id uuid NOT NULL REFERENCES public.brands(id),
  seeded_by uuid NOT NULL,
  PRIMARY KEY (product_id, brand_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brands, public.product_brands
  TO anon, authenticated, service_role;

-- Function signatures exist before record-only migration; bodies stay untouched.
CREATE FUNCTION public.normalize_brand_name(text) RETURNS text LANGUAGE sql AS $$ SELECT $1 $$;
CREATE FUNCTION public.set_product_brands(uuid, uuid, uuid[]) RETURNS void LANGUAGE sql AS $$ SELECT NULL $$;
CREATE FUNCTION public.prevent_source_managed_product_field_updates() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE FUNCTION public.touch_catalog_on_source_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;

-- Reproduce older migration state; new migration must remove old write policy.
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brands_select_public" ON public.brands FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "product_brands_select_public" ON public.product_brands FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "product_brands_manage_authenticated" ON public.product_brands FOR ALL TO authenticated USING (true) WITH CHECK (true);

\i supabase/migrations/20260923060002_record_production_catalog_security.sql
-- Replay against production-equivalent state: no policy or config drift.
\i supabase/migrations/20260923060002_record_production_catalog_security.sql

DO $$
DECLARE
  policy_count integer;
  all_policy_count integer;
  pinned_count integer;
BEGIN
  SELECT count(*) INTO policy_count
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
  WHERE c.relname IN ('brands', 'product_brands')
    AND p.polname = 'Catalog is publicly readable'
    AND p.polcmd = 'r'
    AND pg_get_expr(p.polqual, p.polrelid) = 'true';
  IF policy_count <> 2 THEN RAISE EXCEPTION 'expected two production SELECT policies, got %', policy_count; END IF;

  SELECT count(*) INTO all_policy_count
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
  WHERE c.relname IN ('brands', 'product_brands');
  IF all_policy_count <> 2 THEN RAISE EXCEPTION 'unexpected extra catalog policy: %', all_policy_count; END IF;

  IF (SELECT count(*) FROM pg_class WHERE relname IN ('brands', 'product_brands') AND relrowsecurity) <> 2 THEN
    RAISE EXCEPTION 'RLS not enabled on both catalog tables';
  END IF;

  SELECT count(*) INTO pinned_count FROM pg_proc p
  WHERE p.proname IN ('normalize_brand_name', 'set_product_brands',
    'prevent_source_managed_product_field_updates', 'set_updated_at',
    'touch_catalog_on_source_change')
    AND 'search_path=""' = ANY (p.proconfig);
  IF pinned_count <> 5 THEN RAISE EXCEPTION 'expected five pinned functions, got %', pinned_count; END IF;
END $$;

INSERT INTO public.brands (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Fixture A'),
  ('00000000-0000-0000-0000-000000000002', 'Fixture B');
INSERT INTO public.product_brands (product_id, brand_id, seeded_by) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002');

-- Each app role sees rows seeded for both users. None can write directly.
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.brands) <> 2 OR
     (SELECT count(*) FROM public.product_brands) <> 2 THEN
    RAISE EXCEPTION 'anon cannot read both users rows';
  END IF;
  BEGIN
    INSERT INTO public.brands VALUES ('00000000-0000-0000-0000-000000000004', 'Anon write');
    RAISE EXCEPTION 'anon brand insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"role":"authenticated","sub":"20000000-0000-0000-0000-000000000001","app_role":"viewer"}';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.brands) <> 2 OR
     (SELECT count(*) FROM public.product_brands) <> 2 THEN
    RAISE EXCEPTION 'viewer cannot read other users rows';
  END IF;
  BEGIN
    INSERT INTO public.product_brands VALUES
      ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'viewer insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.brands VALUES ('00000000-0000-0000-0000-000000000004', 'Viewer write');
    RAISE EXCEPTION 'viewer brand insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SET LOCAL request.jwt.claims = '{"role":"authenticated","sub":"20000000-0000-0000-0000-000000000001","app_role":"editor"}';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.product_brands) <> 2 THEN
    RAISE EXCEPTION 'editor cannot read other users rows';
  END IF;
  UPDATE public.product_brands SET seeded_by = '20000000-0000-0000-0000-000000000001'
  WHERE seeded_by = '20000000-0000-0000-0000-000000000002';
  IF FOUND THEN RAISE EXCEPTION 'editor update unexpectedly succeeded'; END IF;
  UPDATE public.brands SET name = 'Editor write'
  WHERE id = '00000000-0000-0000-0000-000000000002';
  IF FOUND THEN RAISE EXCEPTION 'editor brand update unexpectedly succeeded'; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"role":"authenticated","sub":"20000000-0000-0000-0000-000000000001","app_role":"admin"}';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.product_brands) <> 2 THEN
    RAISE EXCEPTION 'admin cannot read other users rows';
  END IF;
  DELETE FROM public.product_brands
  WHERE seeded_by = '20000000-0000-0000-0000-000000000002';
  IF FOUND THEN RAISE EXCEPTION 'admin direct delete unexpectedly succeeded'; END IF;
  DELETE FROM public.brands
  WHERE id = '00000000-0000-0000-0000-000000000002';
  IF FOUND THEN RAISE EXCEPTION 'admin direct brand delete unexpectedly succeeded'; END IF;
END $$;
RESET ROLE;

SET LOCAL ROLE service_role;
INSERT INTO public.brands (id, name) VALUES
  ('00000000-0000-0000-0000-000000000003', 'Service write');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.brands) <> 3 THEN
    RAISE EXCEPTION 'service role write failed';
  END IF;
END $$;
RESET ROLE;

ROLLBACK;

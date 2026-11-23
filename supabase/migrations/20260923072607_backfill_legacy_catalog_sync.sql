-- One catalog product per source code. Existing production rows were checked
-- for duplicates before this migration (0 duplicates on 2026-09-23).
-- The unique index also makes concurrent insert/backfill conflict handling safe.
CREATE UNIQUE INDEX IF NOT EXISTS products_product_code_id_unique_idx
  ON public.products (product_code_id);

-- Shared INSERT mapping. SECURITY INVOKER is intentional: callers are the
-- SECURITY DEFINER source triggers or the migration owner, never API clients.
-- Lock the source row, then re-read it: concurrent UPDATEs cannot make a
-- backfill copy stale data, and two backfill runs serialize on the same code.
CREATE OR REPLACE FUNCTION private.ensure_catalog_entry(p_product_code_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_source public.product_codes%ROWTYPE;
  v_product_id uuid;
  v_primary_brand_id uuid;
BEGIN
  SELECT * INTO v_source
  FROM public.product_codes
  WHERE id = p_product_code_id
  FOR UPDATE;

  IF NOT FOUND OR EXISTS (
    SELECT 1 FROM public.products WHERE product_code_id = p_product_code_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.brands (name)
  SELECT DISTINCT ON (public.normalize_brand_name(item->>'marca')) item->>'marca'
  FROM jsonb_array_elements(COALESCE(v_source.compatibility_data->'items', '[]'::jsonb)) AS item
  WHERE public.normalize_brand_name(item->>'marca') IS NOT NULL
  ON CONFLICT (public.normalize_brand_name(name)) DO NOTHING;

  SELECT b.id INTO v_primary_brand_id
  FROM jsonb_array_elements(COALESCE(v_source.compatibility_data->'items', '[]'::jsonb))
       WITH ORDINALITY AS t(item, ord)
  JOIN public.brands b
    ON public.normalize_brand_name(b.name) = public.normalize_brand_name(t.item->>'marca')
  WHERE public.normalize_brand_name(t.item->>'marca') IS NOT NULL
  ORDER BY t.ord
  LIMIT 1;

  INSERT INTO public.products (
    product_code_id, price, stock, images, status,
    primary_brand_id, model, "subModel"
  ) VALUES (
    v_source.id, 0, 0, ARRAY[]::text[], 'draft',
    v_primary_brand_id,
    v_source.compatibility_data->'items'->0->>'modelo',
    v_source.compatibility_data->'items'->0->>'subModelo'
  )
  ON CONFLICT (product_code_id) DO NOTHING
  RETURNING id INTO v_product_id;

  -- A concurrent catalog insert won: its row and owned fields stay untouched.
  IF v_product_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.product_brands (product_id, brand_id)
  SELECT DISTINCT v_product_id, b.id
  FROM jsonb_array_elements(COALESCE(v_source.compatibility_data->'items', '[]'::jsonb)) AS item
  JOIN public.brands b
    ON public.normalize_brand_name(b.name) = public.normalize_brand_name(item->>'marca')
  WHERE public.normalize_brand_name(item->>'marca') IS NOT NULL
  ON CONFLICT DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION private.ensure_catalog_entry(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_catalog_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM private.ensure_catalog_entry(NEW.id);
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.create_catalog_entry() IS
  'AFTER INSERT trigger on product_codes: mirrors one draft catalog row using the normalized brands / product_brands schema.';

CREATE OR REPLACE FUNCTION public.touch_catalog_on_source_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_product_id uuid;
  v_primary_brand_id uuid;
  v_marca_count int;
BEGIN
  SELECT id INTO v_product_id
  FROM public.products
  WHERE product_code_id = NEW.id;

  -- A legacy source row has no mirror. Create it from its current data;
  -- no product_codes UPDATE is needed and no existing catalog row is changed.
  IF v_product_id IS NULL THEN
    PERFORM private.ensure_catalog_entry(NEW.id);
    RETURN NEW;
  END IF;

  IF NEW.compatibility_data IS DISTINCT FROM OLD.compatibility_data THEN
    PERFORM set_config('app.product_codes_sync', 'on', true);

    INSERT INTO public.brands (name)
    SELECT DISTINCT ON (public.normalize_brand_name(item->>'marca')) item->>'marca'
    FROM jsonb_array_elements(COALESCE(NEW.compatibility_data->'items', '[]'::jsonb)) AS item
    WHERE public.normalize_brand_name(item->>'marca') IS NOT NULL
    ON CONFLICT (public.normalize_brand_name(name)) DO NOTHING;

    SELECT count(*) INTO v_marca_count
    FROM jsonb_array_elements(COALESCE(NEW.compatibility_data->'items', '[]'::jsonb)) AS item
    WHERE public.normalize_brand_name(item->>'marca') IS NOT NULL;

    SELECT b.id INTO v_primary_brand_id
    FROM jsonb_array_elements(COALESCE(NEW.compatibility_data->'items', '[]'::jsonb))
         WITH ORDINALITY AS t(item, ord)
    JOIN public.brands b
      ON public.normalize_brand_name(b.name) = public.normalize_brand_name(t.item->>'marca')
    WHERE public.normalize_brand_name(t.item->>'marca') IS NOT NULL
    ORDER BY t.ord
    LIMIT 1;

    INSERT INTO public.product_brands (product_id, brand_id)
    SELECT DISTINCT v_product_id, b.id
    FROM jsonb_array_elements(COALESCE(NEW.compatibility_data->'items', '[]'::jsonb)) AS item
    JOIN public.brands b
      ON public.normalize_brand_name(b.name) = public.normalize_brand_name(item->>'marca')
    WHERE public.normalize_brand_name(item->>'marca') IS NOT NULL
    ON CONFLICT DO NOTHING;

    IF v_marca_count > 0 THEN
      UPDATE public.products
      SET model            = NEW.compatibility_data->'items'->0->>'modelo',
          "subModel"       = NEW.compatibility_data->'items'->0->>'subModelo',
          primary_brand_id = v_primary_brand_id,
          updated_at       = now()
      WHERE id = v_product_id;

      DELETE FROM public.product_brands pb
      WHERE pb.product_id = v_product_id
        AND pb.brand_id NOT IN (
          SELECT b.id
          FROM jsonb_array_elements(COALESCE(NEW.compatibility_data->'items', '[]'::jsonb)) AS item
          JOIN public.brands b
            ON public.normalize_brand_name(b.name) = public.normalize_brand_name(item->>'marca')
          WHERE public.normalize_brand_name(item->>'marca') IS NOT NULL
        );
    ELSE
      UPDATE public.products
      SET model      = NEW.compatibility_data->'items'->0->>'modelo',
          "subModel" = NEW.compatibility_data->'items'->0->>'subModelo',
          updated_at = now()
      WHERE id = v_product_id;
    END IF;

  ELSIF NEW.product_code_data IS DISTINCT FROM OLD.product_code_data
     OR NEW.description_data IS DISTINCT FROM OLD.description_data THEN
    UPDATE public.products
    SET updated_at = now()
    WHERE id = v_product_id;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.touch_catalog_on_source_change() IS
  'AFTER UPDATE trigger on product_codes: creates a missing catalog row, otherwise syncs compatibility fields or touches updated_at.';

-- These are trigger functions, not callable RPCs. Live grants currently let
-- anon/authenticated execute them; existing triggers still run as table owner.
REVOKE ALL ON FUNCTION public.create_catalog_entry()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.touch_catalog_on_source_change()
  FROM PUBLIC, anon, authenticated, service_role;

-- This statement is repeatable. Every source row is eligible, matching the
-- unconditional live INSERT trigger (including draft/archived/unverified).
-- Existing products and their catalog-owned fields are never updated.
DO $backfill$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT pc.id
    FROM public.product_codes pc
    WHERE NOT EXISTS (
      SELECT 1 FROM public.products p WHERE p.product_code_id = pc.id
    )
    ORDER BY pc.id
  LOOP
    PERFORM private.ensure_catalog_entry(v_id);
  END LOOP;
END;
$backfill$;
;

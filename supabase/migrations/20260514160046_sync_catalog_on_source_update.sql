CREATE OR REPLACE FUNCTION public.prevent_source_managed_product_field_updates()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF jwt_role IN ('service_role', 'supabase_admin') THEN
    RETURN new;
  END IF;

  IF coalesce(current_setting('app.product_codes_sync', true), '') = 'on' THEN
    RETURN new;
  END IF;

  IF new.primary_brand_id IS DISTINCT FROM old.primary_brand_id
     OR new.model IS DISTINCT FROM old.model
     OR new."subModel" IS DISTINCT FROM old."subModel" THEN
    RAISE EXCEPTION 'Source-managed fields (primary_brand_id, model, subModel) are read-only in Rhino Catalog';
  END IF;

  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.touch_catalog_on_source_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_product_id uuid;
  v_primary_brand_id uuid;
  v_marca_count int;
BEGIN
  SELECT id INTO v_product_id
  FROM public.products
  WHERE product_code_id = NEW.id;

  IF v_product_id IS NULL THEN
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

    SELECT b.id
    INTO v_primary_brand_id
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
  'AFTER UPDATE trigger on product_codes: re-syncs model, subModel, primary_brand_id and product_brands into public.products when compatibility_data changes; bumps updated_at on any source change.';

DROP TRIGGER IF EXISTS trg_product_codes_after_update ON public.product_codes;

CREATE TRIGGER trg_product_codes_after_update
  AFTER UPDATE ON public.product_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_catalog_on_source_change();;

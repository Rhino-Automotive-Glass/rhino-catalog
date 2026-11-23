CREATE OR REPLACE FUNCTION public.create_catalog_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_product_id uuid;
  v_primary_brand_id uuid;
BEGIN
  -- 1. Ensure a brands row exists for every marca in the compatibility payload.
  INSERT INTO public.brands (name)
  SELECT DISTINCT ON (public.normalize_brand_name(item->>'marca')) item->>'marca'
  FROM jsonb_array_elements(COALESCE(NEW.compatibility_data->'items', '[]'::jsonb)) AS item
  WHERE public.normalize_brand_name(item->>'marca') IS NOT NULL
  ON CONFLICT (public.normalize_brand_name(name)) DO NOTHING;

  -- 2. Primary brand = first marca in payload order.
  SELECT b.id
  INTO v_primary_brand_id
  FROM jsonb_array_elements(COALESCE(NEW.compatibility_data->'items', '[]'::jsonb))
       WITH ORDINALITY AS t(item, ord)
  JOIN public.brands b
    ON public.normalize_brand_name(b.name) = public.normalize_brand_name(t.item->>'marca')
  WHERE public.normalize_brand_name(t.item->>'marca') IS NOT NULL
  ORDER BY t.ord
  LIMIT 1;

  -- 3. Catalog row. Composite FK to product_brands is deferred, so the
  --    membership rows in step 4 satisfy it at commit time.
  INSERT INTO public.products (
    product_code_id, price, stock, images, status,
    primary_brand_id, model, "subModel"
  ) VALUES (
    NEW.id, 0, 0, ARRAY[]::text[], 'draft',
    v_primary_brand_id,
    NEW.compatibility_data->'items'->0->>'modelo',
    NEW.compatibility_data->'items'->0->>'subModelo'
  )
  RETURNING id INTO v_product_id;

  -- 4. Brand membership for every marca (primary included).
  INSERT INTO public.product_brands (product_id, brand_id)
  SELECT DISTINCT v_product_id, b.id
  FROM jsonb_array_elements(COALESCE(NEW.compatibility_data->'items', '[]'::jsonb)) AS item
  JOIN public.brands b
    ON public.normalize_brand_name(b.name) = public.normalize_brand_name(item->>'marca')
  WHERE public.normalize_brand_name(item->>'marca') IS NOT NULL
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.create_catalog_entry() IS
  'AFTER INSERT trigger on product_codes: mirrors a draft catalog row into public.products using the normalized brands / product_brands schema.';

DROP TRIGGER IF EXISTS trg_product_codes_after_insert ON public.product_codes;

CREATE TRIGGER trg_product_codes_after_insert
  AFTER INSERT ON public.product_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.create_catalog_entry();;

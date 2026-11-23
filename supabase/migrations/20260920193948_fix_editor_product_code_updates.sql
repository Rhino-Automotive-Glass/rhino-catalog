-- Editors (hierarchy 60) are full product-code writers in the API and RLS
-- policy. Keep QA (50) restricted to verified-only changes.
CREATE OR REPLACE FUNCTION public.enforce_product_codes_verified_only_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_level int := public.current_user_hierarchy_level();
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF actor_level >= 60 THEN
    RETURN NEW;
  END IF;

  IF actor_level >= 50
     AND (to_jsonb(NEW) - 'verified') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'verified') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'QA users can only update product_codes.verified'
    USING ERRCODE = '42501';
END;
$$;
COMMENT ON FUNCTION public.enforce_product_codes_verified_only_update() IS
  'BEFORE UPDATE guard: editors and above may fully edit product codes; QA may change only verified.';

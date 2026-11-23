CREATE OR REPLACE FUNCTION public.rhino_lock_down_new_functions()
RETURNS event_trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN
    SELECT object_identity
    FROM pg_catalog.pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE FUNCTION', 'CREATE PROCEDURE')
      AND schema_name = 'public'
      AND object_identity <> 'public.normalize_brand_name(text)'
  LOOP
    EXECUTE pg_catalog.format('REVOKE EXECUTE ON ROUTINE %s FROM PUBLIC, anon', obj.object_identity);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.rhino_lock_down_new_functions() IS
  'Event trigger: revokes PUBLIC/anon EXECUTE on every function created in public. See migration 013.';

REVOKE ALL ON FUNCTION public.rhino_lock_down_new_functions() FROM PUBLIC, anon, authenticated;

DROP EVENT TRIGGER IF EXISTS rhino_lock_down_new_functions;
CREATE EVENT TRIGGER rhino_lock_down_new_functions
  ON ddl_command_end
  WHEN TAG IN ('CREATE FUNCTION', 'CREATE PROCEDURE')
  EXECUTE FUNCTION public.rhino_lock_down_new_functions();

ALTER FUNCTION public.assign_default_role()                               SET search_path = '';
ALTER FUNCTION public.create_catalog_entry()                              SET search_path = '';
ALTER FUNCTION public.touch_catalog_on_source_change()                    SET search_path = '';
ALTER FUNCTION public.normalize_brand_name(text)                          SET search_path = '';
ALTER FUNCTION public.prevent_source_managed_product_field_updates()      SET search_path = '';
ALTER FUNCTION public.set_product_brands(uuid, uuid, uuid[])              SET search_path = '';
ALTER FUNCTION public.set_updated_at()                                    SET search_path = '';
ALTER FUNCTION public.update_timestamp()                                  SET search_path = '';
ALTER FUNCTION public.update_updated_at_column()                          SET search_path = '';
ALTER FUNCTION public.update_updated_at()                                 SET search_path = '';

ALTER FUNCTION public.get_current_rhino_number()                          SET search_path = '';
ALTER FUNCTION public.get_next_rhino_number()                             SET search_path = '';
ALTER FUNCTION public.reset_rhino_counter(integer)                        SET search_path = '';
ALTER FUNCTION public.get_user_role(uuid)                                 SET search_path = '';
ALTER FUNCTION public.is_admin()                                          SET search_path = '';
ALTER FUNCTION public.is_admin(uuid)                                      SET search_path = '';
ALTER FUNCTION public.user_has_role(uuid, character varying)              SET search_path = '';;

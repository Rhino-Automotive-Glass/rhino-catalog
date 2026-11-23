DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.assign_default_role();
DROP FUNCTION IF EXISTS public.assign_default_viewer_role();

DROP POLICY IF EXISTS "Authenticated users can access stock" ON public.product_stock;
CREATE POLICY "Users with a role can access stock"
  ON public.product_stock
  FOR ALL
  TO authenticated
  USING ((SELECT public.current_user_hierarchy_level()) >= 10)
  WITH CHECK ((SELECT public.current_user_hierarchy_level()) >= 10);

DROP POLICY IF EXISTS "Authenticated users can access tasks" ON public.tasks;
CREATE POLICY "Users with a role can access tasks"
  ON public.tasks
  FOR ALL
  TO authenticated
  USING ((SELECT public.current_user_hierarchy_level()) >= 10)
  WITH CHECK ((SELECT public.current_user_hierarchy_level()) >= 10);

DROP POLICY IF EXISTS "Authenticated users can view all origin sheets" ON public.origin_sheets;
CREATE POLICY "Users with a role can view all origin sheets"
  ON public.origin_sheets
  FOR SELECT
  TO authenticated
  USING ((SELECT public.current_user_hierarchy_level()) >= 10);;

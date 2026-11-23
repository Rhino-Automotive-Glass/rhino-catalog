DROP POLICY IF EXISTS "Admins can read all roles"    ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles"      ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles"      ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own role"      ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;

DROP POLICY IF EXISTS "product_codes_select" ON public.product_codes;
DROP POLICY IF EXISTS "product_codes_insert" ON public.product_codes;
DROP POLICY IF EXISTS "product_codes_update" ON public.product_codes;
DROP POLICY IF EXISTS "product_codes_delete" ON public.product_codes;
DROP POLICY IF EXISTS "All authenticated users can read products" ON public.product_codes;
DROP POLICY IF EXISTS "Only admins can create products"           ON public.product_codes;

DROP FUNCTION IF EXISTS public.is_admin(uuid);
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.user_has_role(uuid, character varying);
DROP FUNCTION IF EXISTS public.get_user_role(uuid);;

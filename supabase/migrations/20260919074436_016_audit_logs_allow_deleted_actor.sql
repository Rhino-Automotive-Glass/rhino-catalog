ALTER TABLE public.audit_logs ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN public.audit_logs.user_id IS
  'Acting user. NULL once that user has been deleted (FK ON DELETE SET NULL); user_email still identifies them.';

ALTER TABLE public.user_roles
  DROP CONSTRAINT user_roles_assigned_by_fkey,
  ADD CONSTRAINT user_roles_assigned_by_fkey
    FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.user_permissions
  DROP CONSTRAINT user_permissions_granted_by_fkey,
  ADD CONSTRAINT user_permissions_granted_by_fkey
    FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.log_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  known_actor uuid := auth.uid();
  actor_id uuid;
  actor_email text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- OLD.assigned_by is whoever granted the role, not whoever is removing it,
    -- so it is only a fallback for attribution of last resort.
    actor_id := COALESCE(known_actor, OLD.assigned_by, OLD.user_id);
    -- 016: the actor can be the user being deleted (their user_roles /
    -- user_permissions rows cascade away with them). Referencing them would
    -- violate audit_logs' foreign key; record NULL, user_email keeps who.
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = actor_id) THEN
      actor_id := NULL;
    END IF;
    actor_email := COALESCE(
      (SELECT email FROM auth.users WHERE id = known_actor),
      'system'
    );

    INSERT INTO public.audit_logs (
      action, resource_type, resource_id, old_data, new_data, user_id, user_email
    ) VALUES (
      'delete', 'user_role', OLD.user_id, to_jsonb(OLD), NULL,
      actor_id, actor_email
    );

    RETURN OLD;
  END IF;

  actor_id := COALESCE(NEW.assigned_by, known_actor, NEW.user_id);
  actor_email := COALESCE(
    (SELECT email FROM auth.users WHERE id = actor_id),
    (SELECT email FROM auth.users WHERE id = NEW.user_id),
    'system'
  );

  INSERT INTO public.audit_logs (
    action, resource_type, resource_id, old_data, new_data, user_id, user_email
  ) VALUES (
    CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'update' END,
    'user_role',
    NEW.user_id,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW),
    actor_id,
    actor_email
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_permission_override_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  known_actor uuid := auth.uid();
  subject_id uuid := COALESCE(NEW.user_id, OLD.user_id);
  granted_by_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.granted_by ELSE NEW.granted_by END;
  actor_id uuid := COALESCE(known_actor, granted_by_id, subject_id);
BEGIN
  -- 016: the actor can be the user being deleted (their user_roles /
  -- user_permissions rows cascade away with them). Referencing them would
  -- violate audit_logs' foreign key; record NULL, user_email keeps who.
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = actor_id) THEN
    actor_id := NULL;
  END IF;

  INSERT INTO public.audit_logs (
    action, resource_type, resource_id, old_data, new_data, user_id, user_email
  ) VALUES (
    CASE TG_OP
      WHEN 'INSERT' THEN 'create'
      WHEN 'UPDATE' THEN 'update'
      ELSE 'delete'
    END,
    'user_permission',
    subject_id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    actor_id,
    COALESCE((SELECT email FROM auth.users WHERE id = known_actor), 'system')
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;;

ALTER TABLE public.origin_sheets
  DROP CONSTRAINT origin_sheets_user_id_fkey,
  ADD CONSTRAINT origin_sheets_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.diseno_files ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.diseno_files
  DROP CONSTRAINT diseno_files_user_id_fkey,
  ADD CONSTRAINT diseno_files_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.diseno_files.user_id IS
  'Uploader. NULL once their account is deleted; admins can then view and delete the file.';

DROP POLICY IF EXISTS "Admins can view orphaned files" ON public.diseno_files;
CREATE POLICY "Admins can view orphaned files"
  ON public.diseno_files
  FOR SELECT
  TO authenticated
  USING (user_id IS NULL AND (SELECT public.current_user_hierarchy_level()) >= 80);

DROP POLICY IF EXISTS "Admins can delete orphaned files" ON public.diseno_files;
CREATE POLICY "Admins can delete orphaned files"
  ON public.diseno_files
  FOR DELETE
  TO authenticated
  USING (user_id IS NULL AND (SELECT public.current_user_hierarchy_level()) >= 80);;

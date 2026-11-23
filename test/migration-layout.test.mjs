import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);

test("active migrations contain only reviewed, CLI-timestamped files", () => {
  const activeFiles = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  assert.deepEqual(activeFiles, [
    "20260514155505_fix_create_catalog_entry.sql",
    "20260514160046_sync_catalog_on_source_update.sql",
    "20260524112936_202605240001_product_groups.sql",
    "20260524153048_202605240002_product_group_access_policies.sql",
    "20260524160253_202605240003_product_group_images.sql",
    "20260524163330_product_group_description.sql",
    "20260526135321_make_product_group_images_optional.sql",
    "20260527002515_make_product_group_model_optional.sql",
    "20260919044220_010_enable_rls_public_tables.sql",
    "20260919044642_011_revoke_anon_function_execute.sql",
    "20260919044708_012_revoke_public_function_execute.sql",
    "20260919064222_013_harden_functions.sql",
    "20260919071209_014_drop_dead_policies_and_functions.sql",
    "20260919072857_015_restrict_user_hierarchy_level.sql",
    "20260919074436_016_audit_logs_allow_deleted_actor.sql",
    "20260919131549_017_drop_rhino_auto_number.sql",
    "20260919145851_rhino_origin_20260919_keep_sheets_and_files_on_user_delete.sql",
    "20260919154731_018_no_role_no_access.sql",
    "20260920193948_fix_editor_product_code_updates.sql",
    "20260923060002_record_production_catalog_security.sql",
    "20260923072607_backfill_legacy_catalog_sync.sql",
    "20260923152957_track_products_product_code_id_unique_index.sql",
  ]);

  for (const activeFile of activeFiles) {
    assert.match(activeFile, /^\d{14}_[a-z0-9_]+\.sql$/);
  }
});

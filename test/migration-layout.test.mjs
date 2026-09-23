import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);

test("active migrations contain only reviewed, CLI-timestamped files", () => {
  const activeFiles = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  assert.deepEqual(activeFiles, [
    "20260923060002_record_production_catalog_security.sql",
    "20260923152957_track_products_product_code_id_unique_index.sql",
  ]);

  for (const activeFile of activeFiles) {
    assert.match(activeFile, /^\d{14}_[a-z0-9_]+\.sql$/);
  }
});

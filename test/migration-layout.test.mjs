import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);

test("active migrations contain only reviewed, CLI-timestamped files", () => {
  const activeFiles = readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql"));

  assert.deepEqual(activeFiles, ["20260923060002_record_production_catalog_security.sql"]);
  assert.match(activeFiles[0], /^\d{14}_[a-z0-9_]+\.sql$/);
});

# Product code uniqueness ownership

## Scope and production evidence

`rhino-catalog` owns `public.products`. PR 20 in `rhino-product-code-description` added the product-code uniqueness index while implementing source-to-catalog backfill. Production project `uzgomevojvzdzfunjhdr` is the source of truth. Read-only checks on 2026-09-23 returned:

| Check | Production result |
| --- | --- |
| Definition | `CREATE UNIQUE INDEX products_product_code_id_unique_idx ON public.products USING btree (product_code_id)` |
| State | unique, valid, ready, and live; not primary |
| Shape | Independent, immediate B-tree; one key column; not primary, exclusion, constraint-backed, or replica identity; no included columns, predicate, or expression |
| Product rows | 1,727 |
| Null `product_code_id` rows | 0 |
| Duplicate keys | 0 |
| Excess duplicate rows | 0 |

No production schema, data, or migration history was changed while preparing this migration.

## Exact migration SQL

The executable source is [`20260923152957_track_products_product_code_id_unique_index.sql`](../supabase/migrations/20260923152957_track_products_product_code_id_unique_index.sql):

```sql
-- Record the unique product_code_id index owned by rhino-catalog.
-- Production already has this exact index from the source-sync migration.
-- Reject a same-named object unless it is the exact, usable index expected here.
do $migration$
declare
  expected_definition constant text :=
    'CREATE UNIQUE INDEX products_product_code_id_unique_idx ON public.products USING btree (product_code_id)';
  existing_relkind "char";
  existing_definition text;
  existing_unique boolean;
  existing_valid boolean;
  existing_ready boolean;
  existing_live boolean;
  existing_primary boolean;
  existing_immediate boolean;
  existing_exclusion boolean;
  existing_replica_identity boolean;
  existing_constraint_name text;
  duplicate_product_code_id text;
  duplicate_row_count bigint;
begin
  if to_regclass('public.products') is null then
    raise exception using
      errcode = '42P01',
      message = 'required table public.products does not exist';
  end if;

  -- Preserve normal writes while blocking table-level DDL during inspection.
  -- PostgreSQL cannot LOCK TABLE an index relation directly, so deployment
  -- must also serialize all DDL on this table and named index.
  lock table public.products in share update exclusive mode;

  select
    index_class.relkind,
    case
      when index_class.relkind in ('i', 'I') then pg_get_indexdef(index_class.oid)
      else null
    end,
    index_catalog.indisunique,
    index_catalog.indisvalid,
    index_catalog.indisready,
    index_catalog.indislive,
    index_catalog.indisprimary,
    index_catalog.indimmediate,
    index_catalog.indisexclusion,
    index_catalog.indisreplident,
    constraint_catalog.conname
  into
    existing_relkind,
    existing_definition,
    existing_unique,
    existing_valid,
    existing_ready,
    existing_live,
    existing_primary,
    existing_immediate,
    existing_exclusion,
    existing_replica_identity,
    existing_constraint_name
  from pg_catalog.pg_class as index_class
  join pg_catalog.pg_namespace as index_namespace
    on index_namespace.oid = index_class.relnamespace
  left join pg_catalog.pg_index as index_catalog
    on index_catalog.indexrelid = index_class.oid
  left join pg_catalog.pg_constraint as constraint_catalog
    on constraint_catalog.conindid = index_class.oid
  where index_namespace.nspname = 'public'
    and index_class.relname = 'products_product_code_id_unique_idx';

  if found then
    if existing_relkind <> 'i'
       or existing_definition is distinct from expected_definition
       or existing_unique is distinct from true
       or existing_valid is distinct from true
       or existing_ready is distinct from true
       or existing_live is distinct from true
       or existing_primary is distinct from false
       or existing_immediate is distinct from true
       or existing_exclusion is distinct from false
       or existing_replica_identity is distinct from false
       or existing_constraint_name is not null then
      raise exception using
        errcode = '55000',
        message = 'incompatible object named public.products_product_code_id_unique_idx already exists',
        detail = format(
          'Expected independent immediate index %s; found relkind=%s, unique=%s, valid=%s, ready=%s, live=%s, primary=%s, immediate=%s, exclusion=%s, replica_identity=%s, constraint=%s, definition=%s',
          expected_definition,
          coalesce(existing_relkind::text, '<null>'),
          coalesce(existing_unique::text, '<null>'),
          coalesce(existing_valid::text, '<null>'),
          coalesce(existing_ready::text, '<null>'),
          coalesce(existing_live::text, '<null>'),
          coalesce(existing_primary::text, '<null>'),
          coalesce(existing_immediate::text, '<null>'),
          coalesce(existing_exclusion::text, '<null>'),
          coalesce(existing_replica_identity::text, '<null>'),
          coalesce(existing_constraint_name, '<none>'),
          coalesce(existing_definition, '<null>')
        ),
        hint = 'Review and reconcile the existing object; do not replace it automatically.';
    end if;

    return;
  end if;

  select product_code_id::text, count(*)::bigint
  into duplicate_product_code_id, duplicate_row_count
  from public.products
  where product_code_id is not null
  group by product_code_id
  having count(*) > 1
  order by count(*) desc, product_code_id
  limit 1;

  if found then
    raise exception using
      errcode = '23505',
      message = 'cannot create products_product_code_id_unique_idx because duplicate product_code_id values exist',
      detail = format(
        'product_code_id=%s appears in %s rows',
        duplicate_product_code_id,
        duplicate_row_count
      ),
      hint = 'Resolve duplicates through a separately reviewed data migration.';
  end if;

  execute expected_definition;
end
$migration$;
```

## Live versus proposed

Production already matches the expected definition and catalog semantics. Applying this SQL there produces no schema diff: it takes a `SHARE UPDATE EXCLUSIVE` table lock, validates the existing index, and returns. Normal reads and writes continue, while table-level DDL waits until the migration transaction finishes. PostgreSQL does not permit `LOCK TABLE` on an index relation, so execution also requires a no-concurrent-DDL change window covering both `public.products` and `public.products_product_code_id_unique_idx`. In an environment where the index is absent, the migration first rejects duplicate non-null keys, then creates the same index. A same-named relation, constraint-backed index, primary index, deferred index, exclusion index, replica-identity index, non-unique index, differently shaped index, invalid index, unready index, or non-live index aborts instead of being silently accepted.

Repository diff adds one active, CLI-timestamped catalog migration. Production history remains unchanged until separately approved reconciliation.

## Migration-history divergence

Before this change, `origin/main` had one active migration: local-only `20260923060002_record_production_catalog_security`. Sixteen older, hand-versioned migrations are archived and are not active migration history.

Production has 20 history entries, all absent from active catalog history:

```text
20260514155505 fix_create_catalog_entry
20260514160046 sync_catalog_on_source_update
20260524112936 202605240001_product_groups
20260524153048 202605240002_product_group_access_policies
20260524160253 202605240003_product_group_images
20260524163330 product_group_description
20260526135321 make_product_group_images_optional
20260527002515 make_product_group_model_optional
20260919044220 010_enable_rls_public_tables
20260919044642 011_revoke_anon_function_execute
20260919044708 012_revoke_public_function_execute
20260919064222 013_harden_functions
20260919071209 014_drop_dead_policies_and_functions
20260919072857 015_restrict_user_hierarchy_level
20260919074436 016_audit_logs_allow_deleted_actor
20260919131549 017_drop_rhino_auto_number
20260919145851 rhino_origin_20260919_keep_sheets_and_files_on_user_delete
20260919154731 018_no_role_no_access
20260920193948 fix_editor_product_code_updates
20260923072607 backfill_legacy_catalog_sync
```

Production migration `20260923072607_backfill_legacy_catalog_sync` contains `CREATE UNIQUE INDEX IF NOT EXISTS products_product_code_id_unique_idx ON public.products (product_code_id)`. This catalog migration records stricter ownership behavior: exact compatibility must be proven before no-op.

After this PR, `20260923152957_track_products_product_code_id_unique_index` is also local-only until reviewed production reconciliation. This focused migration does not resolve broader shared-ledger divergence. Do not run `supabase db push` or `supabase migration up --linked` while that divergence remains.

## Verification queries

Exact definition and state:

```sql
select
  index_namespace.nspname as schema_name,
  table_class.relname as table_name,
  index_class.relname as index_name,
  access_method.amname as access_method,
  index_catalog.indisunique,
  index_catalog.indisvalid,
  index_catalog.indisready,
  index_catalog.indislive,
  index_catalog.indisprimary,
  index_catalog.indimmediate,
  index_catalog.indisexclusion,
  index_catalog.indisreplident,
  constraint_catalog.conname as constraint_name,
  index_catalog.indnkeyatts,
  index_catalog.indnatts,
  pg_get_expr(index_catalog.indpred, index_catalog.indrelid) as predicate,
  pg_get_expr(index_catalog.indexprs, index_catalog.indrelid) as expressions,
  pg_get_indexdef(index_class.oid) as index_definition
from pg_catalog.pg_class as index_class
join pg_catalog.pg_namespace as index_namespace
  on index_namespace.oid = index_class.relnamespace
join pg_catalog.pg_index as index_catalog
  on index_catalog.indexrelid = index_class.oid
join pg_catalog.pg_class as table_class
  on table_class.oid = index_catalog.indrelid
join pg_catalog.pg_am as access_method
  on access_method.oid = index_class.relam
left join pg_catalog.pg_constraint as constraint_catalog
  on constraint_catalog.conindid = index_class.oid
where index_namespace.nspname = 'public'
  and index_class.relname = 'products_product_code_id_unique_idx';
```

Duplicate count, excluding nulls because a default PostgreSQL unique index permits multiple null values:

```sql
with duplicate_keys as (
  select product_code_id, count(*)::bigint as row_count
  from public.products
  where product_code_id is not null
  group by product_code_id
  having count(*) > 1
)
select
  (select count(*)::bigint from public.products) as total_rows,
  (select count(*)::bigint from public.products where product_code_id is null)
    as null_product_code_id_rows,
  count(*)::bigint as duplicate_key_count,
  coalesce(sum(row_count - 1), 0)::bigint as duplicate_excess_row_count
from duplicate_keys;
```

Production history owning the index:

```sql
select version, name, statements
from supabase_migrations.schema_migrations
where coalesce(array_to_string(statements, E'\n'), '')
  ilike '%products_product_code_id_unique_idx%'
order by version;
```

## Isolated database tests

Run [`products_product_code_id_unique_index.sh`](../supabase/tests/products_product_code_id_unique_index.sh). It starts an isolated temporary PostgreSQL cluster, then proves:

1. Absent index is created with exact definition and usable state.
2. Compatible existing index is preserved with the same OID.
3. Constraint-backed same-named index is rejected.
4. Incompatible same-named non-unique index is rejected.
5. Duplicate non-null keys raise SQLSTATE `23505` and leave the index absent.

The test uses disposable image `public.ecr.aws/supabase/postgres:17.6.1.156` and removes its container on exit. Override `POSTGRES_TEST_IMAGE` to test another PostgreSQL-compatible image.

## Deployment sequence

1. Merge this repository PR after review. Do not deploy database changes from merge automation.
2. Re-run all read-only verification queries against production. Stop if definition, state, duplicates, or history changed.
3. Present fresh outputs and exact migration checksum for explicit production-execution approval.
4. After approval, establish a no-concurrent-DDL change window for `public.products` and `public.products_product_code_id_unique_idx`, then execute only this migration SQL through the reviewed production channel. Existing compatible index makes it a schema no-op; any incompatibility aborts.
5. Re-run definition, state, and duplicate queries. Stop on any mismatch.
6. After separate explicit migration-history approval, verify the linked target, then mark only local version `20260923152957` applied:

   ```bash
   supabase link --project-ref uzgomevojvzdzfunjhdr
   supabase migration repair 20260923152957 --status applied --linked
   ```

   Do not mark archived migrations applied and do not revert remote entries.
7. Run `supabase migration list` and save the result. Broader divergence remains a separate project; `supabase db push` stays blocked until resolved.

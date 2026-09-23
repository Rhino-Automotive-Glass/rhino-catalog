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

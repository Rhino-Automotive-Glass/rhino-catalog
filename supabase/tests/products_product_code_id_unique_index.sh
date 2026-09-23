#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_file="$repo_root/supabase/migrations/20260923152957_track_products_product_code_id_unique_index.sql"
postgres_image="${POSTGRES_TEST_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.156}"
container_name="rhino-product-index-test-$$"
test_root="$(mktemp -d /tmp/rhino-product-index-test.XXXXXX)"

cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  rm -rf "$test_root"
}
trap cleanup EXIT

docker run --detach --rm \
  --name "$container_name" \
  --env POSTGRES_PASSWORD=postgres \
  --env POSTGRES_DB=postgres \
  "$postgres_image" >/dev/null

for _ in $(seq 1 60); do
  if docker logs "$container_name" 2>&1 \
       | grep -F 'PostgreSQL init process complete; ready for start up' >/dev/null \
     && docker exec "$container_name" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
docker logs "$container_name" 2>&1 \
  | grep -F 'PostgreSQL init process complete; ready for start up' >/dev/null
docker exec "$container_name" pg_isready -U postgres -d postgres >/dev/null

run_psql() {
  docker exec -i "$container_name" \
    psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

reset_products_table() {
  run_psql >/dev/null <<'SQL'
drop schema public cascade;
create schema public;
create table public.products (
  id bigint generated always as identity primary key,
  product_code_id uuid
);
SQL
}

assert_compatible_index() {
  run_psql >/dev/null <<'SQL'
do $test$
declare
  actual_definition text;
begin
  select pg_get_indexdef(index_class.oid)
  into actual_definition
  from pg_catalog.pg_class as index_class
  join pg_catalog.pg_namespace as index_namespace
    on index_namespace.oid = index_class.relnamespace
  join pg_catalog.pg_index as index_catalog
    on index_catalog.indexrelid = index_class.oid
  where index_namespace.nspname = 'public'
    and index_class.relname = 'products_product_code_id_unique_idx'
    and index_catalog.indisunique
    and index_catalog.indisvalid
    and index_catalog.indisready
    and index_catalog.indislive;

  if actual_definition is distinct from
     'CREATE UNIQUE INDEX products_product_code_id_unique_idx ON public.products USING btree (product_code_id)' then
    raise exception 'unexpected index definition: %', actual_definition;
  end if;
end
$test$;
SQL
}

reset_products_table
run_psql <"$migration_file" >/dev/null
assert_compatible_index
printf 'PASS: absent index created with exact definition\n'

reset_products_table
run_psql >/dev/null <<'SQL'
create unique index products_product_code_id_unique_idx
  on public.products using btree (product_code_id);
SQL
index_oid_before="$(run_psql -Atc "select 'public.products_product_code_id_unique_idx'::regclass::oid")"
run_psql <"$migration_file" >/dev/null
index_oid_after="$(run_psql -Atc "select 'public.products_product_code_id_unique_idx'::regclass::oid")"
[[ "$index_oid_before" == "$index_oid_after" ]]
assert_compatible_index
printf 'PASS: compatible existing index preserved\n'

reset_products_table
run_psql >/dev/null <<'SQL'
alter table public.products
  add constraint products_product_code_id_unique_idx unique (product_code_id);
SQL
if run_psql <"$migration_file" >"$test_root/constraint-backed.out" 2>&1; then
  printf 'FAIL: constraint-backed same-named index was accepted\n' >&2
  exit 1
fi
grep -q 'incompatible object named public.products_product_code_id_unique_idx already exists' \
  "$test_root/constraint-backed.out"
printf 'PASS: constraint-backed same-named index rejected\n'

reset_products_table
run_psql >/dev/null <<'SQL'
create index products_product_code_id_unique_idx
  on public.products using btree (product_code_id);
SQL
if run_psql <"$migration_file" >"$test_root/incompatible.out" 2>&1; then
  printf 'FAIL: incompatible same-named index was accepted\n' >&2
  exit 1
fi
grep -q 'incompatible object named public.products_product_code_id_unique_idx already exists' \
  "$test_root/incompatible.out"
printf 'PASS: incompatible same-named index rejected\n'

reset_products_table
run_psql >/dev/null <<'SQL'
insert into public.products (product_code_id)
values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000001');
SQL
if run_psql -v VERBOSITY=verbose <"$migration_file" >"$test_root/duplicates.out" 2>&1; then
  printf 'FAIL: duplicate product_code_id values were accepted\n' >&2
  exit 1
fi
grep -q '23505' "$test_root/duplicates.out"
grep -q 'cannot create products_product_code_id_unique_idx because duplicate product_code_id values exist' \
  "$test_root/duplicates.out"
[[ "$(run_psql -Atc "select to_regclass('public.products_product_code_id_unique_idx') is null")" == "t" ]]
printf 'PASS: duplicate product_code_id values rejected before index creation\n'

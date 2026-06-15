// Auto-link products to product groups by exact compatibility match.
//
// Reusable / idempotent / additive-only. Safe to re-run (cron-friendly).
//
// Matching mirrors `productMatchesGroupExact` in src/lib/product-group-query.ts
// (keep the two in sync). A product is linked to a group when ANY single
// compatibility item matches on all of the group's set fields:
//   brand (marca)         required, exact (normalized)
//   sub_model (subModelo) required, exact (normalized)
//   version               optional - exact when the group sets it, else wildcard
//   additional            optional - exact when the group sets it, else wildcard
// Year is a hard gate: when the group has a year range, the product must overlap.
// `other` is NOT a match field (descriptor only, e.g. Sprinter Corta/Jumbo/Larga).
//
// Usage:
//   node --env-file=.env.local scripts/auto-link-groups.mjs            # dry-run (add only)
//   node --env-file=.env.local scripts/auto-link-groups.mjs --apply    # write new links
//   ... --sync                    also prune stale auto links (add + remove)
//   ... --sync --apply            write adds and deletions
//   ... --group=<slug-or-id>      restrict to one group
//   ... --status=published,draft  group statuses to process (default: not archived)
//
// Links created by this script are tagged source='auto'. --sync only ever
// deletes source='auto' rows; manual links added in the admin are never removed.

import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
// --sync also prunes stale auto-created links (source='auto') that no longer
// match their group. Manual links (source='manual') are never touched.
const SYNC = args.includes("--sync");
const groupArg = (args.find((a) => a.startsWith("--group=")) ?? "").split("=")[1] || null;
const statusArg = (args.find((a) => a.startsWith("--status=")) ?? "").split("=")[1] || null;
const statusFilter = statusArg ? statusArg.split(",").map((s) => s.trim()) : null;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local).");
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// --- match helpers (mirror of src/lib/product-group-query.ts) ---
const norm = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const parseYears = (s) => (String(s ?? "").match(/\b(?:19|20)\d{2}\b/g) ?? []).map(Number);

function yearOverlap(product, ys, ye) {
  if (ys == null && ye == null) return true;
  const years = product.years;
  if (years.length === 0) return true; // no year evidence -> not excluded (matches app behavior)
  const start = ys ?? ye;
  const end = ye ?? ys;
  return years.some((y) => y >= start && y <= end);
}

const isPrecise = (group) => Boolean(group.version || group.additional);

function matches(product, group) {
  if (!group.brandName || !group.sub_model) return false; // brand + sub_model required
  const brand = norm(group.brandName);
  const sub = norm(group.sub_model);
  const ver = group.version ? norm(group.version) : null;
  const add = group.additional ? norm(group.additional) : null;
  const fieldMatch = product.items.some(
    (it) =>
      norm(it.marca) === brand &&
      norm(it.subModelo) === sub &&
      (ver === null || norm(it.version) === ver) &&
      (add === null || norm(it.additional) === add)
  );
  if (!fieldMatch) return false;
  // Year is a hard gate only for coarse (sub_model-only) groups. Precise groups
  // (version/additional set) trust the field match, since product source years
  // often pre-date the group's year range.
  if (!isPrecise(group) && (group.year_start != null || group.year_end != null)) {
    if (!yearOverlap(product, group.year_start, group.year_end)) return false;
  }
  return true;
}

// --- fetch helpers (paginate past PostgREST's 1000-row cap) ---
async function fetchAll(table, select, tweak) {
  const out = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let q = db.from(table).select(select).range(from, from + pageSize - 1);
    if (tweak) q = tweak(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}

async function main() {
  // Groups
  let groups = await fetchAll(
    "product_groups",
    "id,name,slug,status,sub_model,version,additional,other,year_start,year_end,brand:brands!product_groups_brand_id_fkey(name)",
    (q) => q.order("name")
  );
  groups = groups
    .map((g) => ({ ...g, brandName: g.brand?.name ?? null }))
    .filter((g) => (statusFilter ? statusFilter.includes(g.status) : g.status !== "archived"))
    .filter((g) => (groupArg ? g.id === groupArg || g.slug === groupArg : true));

  // Products (+ source compatibility). Skip hidden (product_code_data.parte === "s").
  const rawProducts = await fetchAll(
    "products",
    "id,product_codes!products_product_code_id_fkey(product_code_data,compatibility_data,description_data)"
  );
  const products = rawProducts
    .map((row) => {
      const pc = Array.isArray(row.product_codes) ? row.product_codes[0] : row.product_codes;
      const items = pc?.compatibility_data?.items ?? [];
      const years = [
        ...parseYears(pc?.compatibility_data?.generated),
        ...parseYears(pc?.description_data?.generated),
        ...items.flatMap((it) => parseYears(it.modelo)),
      ];
      return {
        id: row.id,
        parte: String(pc?.product_code_data?.parte ?? "").trim().toLowerCase(),
        items,
        years,
      };
    })
    .filter((p) => p.parte !== "s");

  // Existing memberships (track all + which are auto-created)
  const memberships = await fetchAll("product_group_products", "group_id,product_id,source");
  const linked = new Map(); // group_id -> Set(all product_ids)
  const linkedAuto = new Map(); // group_id -> Set(auto product_ids)
  for (const m of memberships) {
    if (!linked.has(m.group_id)) linked.set(m.group_id, new Set());
    linked.get(m.group_id).add(m.product_id);
    if (m.source === "auto") {
      if (!linkedAuto.has(m.group_id)) linkedAuto.set(m.group_id, new Set());
      linkedAuto.get(m.group_id).add(m.product_id);
    }
  }

  console.log(`Mode: ${SYNC ? "SYNC" : "ADD"} ${APPLY ? "APPLY (writing)" : "DRY-RUN (no writes)"}`);
  console.log(`Groups: ${groups.length}   Candidate products: ${products.length}\n`);

  let totalNew = 0;
  let totalPrune = 0;
  let skipped = 0;
  const toInsert = [];
  const toDelete = []; // { group_id, product_id }
  for (const g of groups) {
    const label = [g.sub_model, g.version, g.additional, g.other].filter(Boolean).join(" ");
    const precise = isPrecise(g);

    // Without --sync, coarse groups are skipped entirely (no add, no prune).
    // With --sync, coarse groups are still processed so their now-stale auto
    // links get pruned (their desired set is empty).
    if (!precise && !SYNC) {
      skipped += 1;
      console.log(`${g.name}  (${label})  SKIPPED [coarse: no version/additional]`);
      continue;
    }

    const already = linked.get(g.id) ?? new Set();
    const autoLinks = linkedAuto.get(g.id) ?? new Set();

    // Desired auto-link set: precise groups -> matching products; coarse -> none.
    const desired = precise ? products.filter((p) => matches(p, g)) : [];
    const desiredIds = new Set(desired.map((p) => p.id));

    const fresh = desired.filter((p) => !already.has(p.id));
    const prune = SYNC ? [...autoLinks].filter((pid) => !desiredIds.has(pid)) : [];
    totalNew += fresh.length;
    totalPrune += prune.length;

    const tag = precise ? "" : " [coarse]";
    console.log(
      `${g.name}  (${label} ${g.year_start ?? ""}-${g.year_end ?? ""})${tag}\n` +
        `   matched ${desired.length}, new ${fresh.length}, prune(auto) ${prune.length}`
    );
    if (fresh.length) console.log(`   + ${fresh.slice(0, 5).map((p) => p.id.slice(0, 8)).join(", ")}`);
    if (prune.length) console.log(`   - ${prune.slice(0, 5).map((id) => id.slice(0, 8)).join(", ")}`);

    for (const p of fresh) {
      toInsert.push({ group_id: g.id, product_id: p.id, sort_order: 0, is_featured: false, source: "auto" });
    }
    for (const pid of prune) toDelete.push({ group_id: g.id, product_id: pid });
  }

  console.log(`\nGroups processed: ${groups.length - skipped}   Coarse skipped: ${skipped}`);
  console.log(`New links: ${totalNew}   Stale auto links to prune: ${totalPrune}`);

  if (!APPLY) {
    console.log(`Dry-run only. Re-run with --apply${SYNC ? "" : " (and --sync to prune)"} to write.`);
    return;
  }

  // Idempotent additive upsert in batches.
  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500);
    const { error } = await db
      .from("product_group_products")
      .upsert(batch, { onConflict: "group_id,product_id", ignoreDuplicates: true });
    if (error) throw error;
    console.log(`  inserted ${Math.min(i + 500, toInsert.length)}/${toInsert.length}`);
  }

  // Prune stale auto links (only with --sync). Never deletes source='manual'.
  for (const d of toDelete) {
    const { error } = await db
      .from("product_group_products")
      .delete()
      .eq("group_id", d.group_id)
      .eq("product_id", d.product_id)
      .eq("source", "auto");
    if (error) throw error;
  }
  if (toDelete.length) console.log(`  pruned ${toDelete.length} auto links`);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

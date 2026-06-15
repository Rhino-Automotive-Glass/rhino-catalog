import type {
  Brand,
  ProductGroup,
  ProductGroupProduct,
  ProductWithSource,
} from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapProductRow, PRODUCT_WITH_SOURCE_SELECT } from "@/lib/product-query";
import { getProductDisplayName, getProductDisplayYear } from "@/lib/product-display";

type RawBrand = {
  id: string;
  name: string;
};

type RawProductGroupRow = Omit<ProductGroup, "brand"> & {
  brand: RawBrand | RawBrand[] | null;
};

type RawProductForMap = Parameters<typeof mapProductRow>[0];

type RawProductGroupProductRow = Omit<ProductGroupProduct, "product"> & {
  product: RawProductForMap | RawProductForMap[] | null;
};

export const PRODUCT_GROUP_SELECT = `
  id,
  slug,
  name,
  description,
  images,
  brand_id,
  model,
  sub_model,
  version,
  additional,
  other,
  year_start,
  year_end,
  status,
  sort_order,
  created_at,
  updated_at,
  brand:brands!product_groups_brand_id_fkey (
    id,
    name
  )
`;

export const PRODUCT_GROUP_PRODUCT_SELECT = `
  group_id,
  product_id,
  sort_order,
  is_featured,
  created_at,
  product:products!product_group_products_product_id_fkey (
    ${PRODUCT_WITH_SOURCE_SELECT}
  )
`;

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeText(value: string | null | undefined): string {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase() ?? "";
}

function textMatches(candidate: string | null | undefined, desired: string): boolean {
  const normalizedCandidate = normalizeText(candidate);
  const normalizedDesired = normalizeText(desired);

  if (!normalizedCandidate || !normalizedDesired) return false;

  return (
    normalizedCandidate === normalizedDesired ||
    normalizedCandidate.includes(normalizedDesired) ||
    normalizedDesired.includes(normalizedCandidate)
  );
}

function parseYearRange(value: string | null): number[] {
  const years = value?.match(/\b(?:19|20)\d{2}\b/g) ?? [];
  return years.map((year) => Number(year)).filter(Number.isFinite);
}

function hasYearOverlap(
  product: ProductWithSource,
  yearStart: number | null,
  yearEnd: number | null
): boolean {
  if (yearStart === null && yearEnd === null) return true;

  const years = [
    ...parseYearRange(getProductDisplayYear(product)),
    ...parseYearRange(product.product_codes?.compatibility_data?.generated ?? null),
    ...parseYearRange(product.product_codes?.description_data?.generated ?? null),
  ];

  if (years.length === 0) return true;

  const start = yearStart ?? yearEnd;
  const end = yearEnd ?? yearStart;

  return years.some((year) => year >= Number(start) && year <= Number(end));
}

function hasGroupYearFilter(yearStart: number | null, yearEnd: number | null): boolean {
  return yearStart !== null || yearEnd !== null;
}

export function buildProductGroupSearchFilter(search: string): string | null {
  const safeSearch = search
    .normalize("NFKC")
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!safeSearch) return null;

  const escapedSearch = safeSearch
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  const pattern = `%${escapedSearch}%`;

  return ["name", "slug", "description", "model", "sub_model", "version", "additional", "other"]
    .map((column) => `${column}.ilike.${pattern}`)
    .join(",");
}

export function mapProductGroupRow(row: RawProductGroupRow): ProductGroup {
  const brand = unwrapRelation(row.brand);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    images: Array.isArray(row.images) ? row.images.slice(0, 3) : [],
    brand_id: row.brand_id,
    brand: brand ? { id: brand.id, name: brand.name } : null,
    model: row.model,
    sub_model: row.sub_model,
    version: row.version,
    additional: row.additional,
    other: row.other,
    year_start: row.year_start,
    year_end: row.year_end,
    status: row.status,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function mapProductGroupProductRow(
  row: RawProductGroupProductRow
): ProductGroupProduct | null {
  const product = unwrapRelation(row.product);

  if (!product) return null;

  return {
    group_id: row.group_id,
    product_id: row.product_id,
    sort_order: row.sort_order,
    is_featured: row.is_featured,
    created_at: row.created_at,
    product: mapProductRow(product),
  };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function buildGroupLabel(
  group: Pick<
    ProductGroup,
    "sub_model" | "version" | "additional" | "other" | "year_start" | "year_end"
  >
) {
  const years =
    group.year_start || group.year_end
      ? `${group.year_start ?? ""}${group.year_start && group.year_end ? "-" : ""}${group.year_end ?? ""}`
      : "";

  const vehicle = [group.sub_model, group.version, group.additional, group.other]
    .filter(Boolean)
    .join(" ");

  return [vehicle, years].filter(Boolean).join(" ");
}

/**
 * Drop a leading brand token from a model/name string so slugs don't double the
 * brand (e.g. brand "Ford" + "FORD TRANSIT" -> "TRANSIT"). Case-insensitive;
 * matches the brand as a whole leading word or the entire string.
 */
export function stripLeadingBrand(modelPart: string, brandName: string): string {
  if (!brandName) return modelPart;
  const escaped = brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return modelPart.replace(new RegExp(`^${escaped}(\\s+|$)`, "i"), "");
}

export function generateProductGroupSlug(
  group: Pick<ProductGroup, "brand" | "name" | "sub_model" | "year_start" | "year_end">
): string {
  const brandName = group.brand?.name ?? "";
  const value = [
    brandName,
    stripLeadingBrand(group.sub_model ?? group.name, brandName),
    group.year_start && group.year_end
      ? `${group.year_start}-${group.year_end}`
      : group.year_start ?? group.year_end,
  ]
    .filter(Boolean)
    .join(" ");

  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  return (
    error?.code === "23505" ||
    error?.message?.toLowerCase().includes("duplicate key value") === true
  );
}

export async function resolveUniqueProductGroupSlug(
  supabase: SupabaseClient,
  baseSlug: string,
  excludeId?: string
): Promise<string> {
  const normalizedBase = baseSlug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!normalizedBase) return baseSlug;

  const { data, error } = await supabase
    .from("product_groups")
    .select("id, slug")
    .or(`slug.eq.${normalizedBase},slug.like.${normalizedBase}-%`);

  if (error) {
    throw new Error(error.message);
  }

  const existingSlugs = new Set(
    (data ?? [])
      .filter((row) => row.id !== excludeId)
      .map((row) => row.slug as string)
      .filter(Boolean)
  );

  if (!existingSlugs.has(normalizedBase)) return normalizedBase;

  let suffix = 2;
  let candidate = `${normalizedBase}-${suffix}`;

  while (existingSlugs.has(candidate)) {
    suffix += 1;
    candidate = `${normalizedBase}-${suffix}`;
  }

  return candidate;
}

export function getProductGroupSuggestionScore(
  product: ProductWithSource,
  group: ProductGroup
): number {
  const compatibilityItems = product.product_codes.compatibility_data.items ?? [];
  let score = 0;

  if (group.brand) {
    const brandMatched =
      product.primary_brand?.id === group.brand.id ||
      product.additional_brands.some((brand: Brand) => brand.id === group.brand?.id) ||
      compatibilityItems.some((item) => textMatches(item.marca, group.brand?.name ?? ""));

    if (!brandMatched) return 0;
    score += 40;
  }

  if (group.sub_model) {
    const subModelMatched =
      textMatches(product.subModel, group.sub_model) ||
      compatibilityItems.some(
        (item) =>
          textMatches(item.subModelo, group.sub_model ?? "") ||
          textMatches(item.version, group.sub_model ?? "") ||
          textMatches(item.additional, group.sub_model ?? "")
      ) ||
      textMatches(product.product_codes.compatibility_data.generated, group.sub_model);

    if (!subModelMatched) return 0;
    score += 45;
  }

  if (hasGroupYearFilter(group.year_start, group.year_end)) {
    if (!hasYearOverlap(product, group.year_start, group.year_end)) return 0;
    score += 15;
  }

  return score;
}

export function getProductGroupSuggestionReason(product: ProductWithSource, group: ProductGroup): string {
  const label = buildGroupLabel(group);
  const parts = [group.brand?.name, label || group.name].filter(Boolean);
  const displayName = getProductDisplayName(product);

  return `Matches ${parts.join(" / ")} compatibility for ${displayName}.`;
}

/**
 * Strict, exact membership test used by the auto-link script.
 *
 * A product belongs in a group when ANY single compatibility item matches the
 * group on all of its set fields:
 *   - brand (marca)        : required, exact (normalized)
 *   - sub_model (subModelo): required, exact (normalized)
 *   - version              : optional — when the group sets it, the item must
 *                            match exactly; when null, any version is accepted
 *   - additional           : optional — same rule as version
 *
 * A group is "precise" when it sets version or additional. Year is a hard gate
 * only for coarse (sub_model-only) groups; precise groups trust the field match
 * because product source years often pre-date the group's year range.
 *
 * `other` is intentionally NOT a match field: it holds descriptors with no
 * product equivalent yet (e.g. Sprinter Corta/Jumbo/Larga).
 *
 * Note: the auto-link script (scripts/auto-link-groups.mjs) mirrors this logic
 * and additionally skips coarse groups entirely — keep the two in sync.
 */
export function isPreciseProductGroup(
  group: Pick<ProductGroup, "version" | "additional">
): boolean {
  return Boolean(group.version || group.additional);
}

export function productMatchesGroupExact(product: ProductWithSource, group: ProductGroup): boolean {
  // Confidence threshold: brand AND sub_model must be present and matched.
  if (!group.brand || !group.sub_model) return false;

  const brand = normalizeText(group.brand.name);
  const subModel = normalizeText(group.sub_model);
  const version = group.version ? normalizeText(group.version) : null;
  const additional = group.additional ? normalizeText(group.additional) : null;

  const items = product.product_codes?.compatibility_data?.items ?? [];
  const fieldMatch = items.some((item) => {
    if (normalizeText(item.marca) !== brand) return false;
    if (normalizeText(item.subModelo) !== subModel) return false;
    if (version !== null && normalizeText(item.version) !== version) return false;
    if (additional !== null && normalizeText(item.additional) !== additional) return false;
    return true;
  });

  if (!fieldMatch) return false;

  // Year hard gate only for coarse groups; precise groups skip it.
  if (!isPreciseProductGroup(group) && hasGroupYearFilter(group.year_start, group.year_end)) {
    if (!hasYearOverlap(product, group.year_start, group.year_end)) return false;
  }

  return true;
}

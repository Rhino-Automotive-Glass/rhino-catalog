import type {
  Brand,
  ProductGroup,
  ProductGroupProduct,
  ProductWithSource,
} from "@/lib/types";
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

  return ["name", "slug", "description", "model", "sub_model"]
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

export function buildGroupLabel(group: Pick<ProductGroup, "sub_model" | "year_start" | "year_end">) {
  const years =
    group.year_start || group.year_end
      ? `${group.year_start ?? ""}${group.year_start && group.year_end ? "-" : ""}${group.year_end ?? ""}`
      : "";

  return [group.sub_model, years].filter(Boolean).join(" ");
}

export function generateProductGroupSlug(
  group: Pick<ProductGroup, "brand" | "name" | "sub_model" | "year_start" | "year_end">
): string {
  const value = [
    group.brand?.name,
    group.sub_model ?? group.name,
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

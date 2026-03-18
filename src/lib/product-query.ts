import type { Brand, ProductCode, ProductWithSource } from "@/lib/types";

type RawBrand = {
  id: string;
  name: string;
};

type RawBrandRelation = {
  brand: RawBrand | RawBrand[] | null;
};

type RawProductRow = {
  id: string;
  product_code_id: string;
  price: number;
  stock: number;
  primary_brand_id: string | null;
  model: string | null;
  subModel: string | null;
  images: ProductWithSource["images"];
  status: ProductWithSource["status"];
  created_at: string;
  updated_at: string;
  product_codes: ProductCode;
  primary_brand: RawBrand | RawBrand[] | null;
  product_brands: RawBrandRelation[] | null;
};

const PRODUCT_CODE_SELECT = `
  id,
  product_code_data,
  description_data,
  compatibility_data,
  status,
  verified,
  notes,
  created_at,
  updated_at
`;

export const PRODUCT_WITH_SOURCE_SELECT = `
  id,
  product_code_id,
  price,
  stock,
  primary_brand_id,
  model,
  subModel,
  images,
  status,
  created_at,
  updated_at,
  primary_brand:brands!products_primary_brand_id_fkey (
    id,
    name
  ),
  product_brands:product_brands!product_brands_product_id_fkey (
    brand:brands!product_brands_brand_id_fkey (
      id,
      name
    )
  ),
  product_codes!products_product_code_id_fkey (
    ${PRODUCT_CODE_SELECT}
  )
`;

export const PRODUCT_WITH_SOURCE_BRAND_FILTER_SELECT = `
  id,
  product_code_id,
  price,
  stock,
  primary_brand_id,
  model,
  subModel,
  images,
  status,
  created_at,
  updated_at,
  primary_brand:brands!products_primary_brand_id_fkey (
    id,
    name
  ),
  product_brands:product_brands!product_brands_product_id_fkey!inner (
    brand:brands!product_brands_brand_id_fkey (
      id,
      name
    )
  ),
  product_codes!products_product_code_id_fkey (
    ${PRODUCT_CODE_SELECT}
  )
`;

export const PRODUCT_WITH_SOURCE_INNER_SELECT = `
  id,
  product_code_id,
  price,
  stock,
  primary_brand_id,
  model,
  subModel,
  images,
  status,
  created_at,
  updated_at,
  primary_brand:brands!products_primary_brand_id_fkey (
    id,
    name
  ),
  product_brands:product_brands!product_brands_product_id_fkey (
    brand:brands!product_brands_brand_id_fkey (
      id,
      name
    )
  ),
  product_codes!products_product_code_id_fkey!inner (
    ${PRODUCT_CODE_SELECT}
  )
`;

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function dedupeBrands(brands: Brand[]): Brand[] {
  const seen = new Set<string>();

  return brands.filter((brand) => {
    if (seen.has(brand.id)) return false;
    seen.add(brand.id);
    return true;
  });
}

export function mapProductRow(row: RawProductRow): ProductWithSource {
  const primaryBrand = unwrapRelation(row.primary_brand);
  const additionalBrands = dedupeBrands(
    (row.product_brands ?? [])
      .map((item) => unwrapRelation(item.brand))
      .filter((brand): brand is RawBrand => Boolean(brand))
      .filter((brand) => brand.id !== row.primary_brand_id)
      .map((brand) => ({
        id: brand.id,
        name: brand.name,
      }))
  );

  return {
    id: row.id,
    product_code_id: row.product_code_id,
    price: Number(row.price),
    stock: row.stock,
    primary_brand_id: row.primary_brand_id,
    primary_brand: primaryBrand
      ? {
          id: primaryBrand.id,
          name: primaryBrand.name,
        }
      : null,
    additional_brands: additionalBrands,
    model: row.model,
    subModel: row.subModel,
    images: row.images,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    product_codes: row.product_codes,
  };
}

import type { ProductWithSource } from "@/lib/types";

const YEAR_PATTERN = /\b(?:19|20)\d{2}\b/g;

export function stripProductYears(value: string): string {
  return value
    .replace(YEAR_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,;/)-])/g, "$1")
    .replace(/([(/-])\s+/g, "$1")
    .replace(/[-,/;]\s*$/g, "")
    .trim();
}

export function getProductDisplayYear(product: Pick<ProductWithSource, "product_codes">): string | null {
  const description = product.product_codes?.description_data;
  const candidates = [
    description?.displayName,
    description?.generated,
    product.product_codes?.compatibility_data?.generated,
  ];
  const years = candidates.flatMap((value) => value?.match(YEAR_PATTERN) ?? []);
  const uniqueYears = Array.from(new Set(years));

  return uniqueYears.length > 0 ? uniqueYears.join(" - ") : null;
}

export function getProductDisplayName(product: Pick<ProductWithSource, "product_codes">): string {
  const description = product.product_codes?.description_data;
  const name = description?.displayName ?? description?.generated ?? "";

  return stripProductYears(name) || "No description available";
}

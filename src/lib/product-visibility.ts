import type { ProductCode, ProductStatus, ProductVisibilityStatus } from "@/lib/types";

type HiddenProductRule = {
  id: string;
  label: string;
  matches: (productCode: ProductCode | null | undefined) => boolean;
  reason: string;
};

const hiddenProductRules: HiddenProductRule[] = [
  {
    id: "source-parte-s",
    label: "Hide source products with parte = s",
    matches: (productCode) =>
      typeof productCode?.product_code_data?.parte === "string" &&
      productCode.product_code_data.parte.trim().toLowerCase() === "s",
    reason: 'Hidden because Rhino Code marks product_code_data.parte as "s".',
  },
];

export function getProductHiddenRule(productCode: ProductCode | null | undefined) {
  return hiddenProductRules.find((rule) => rule.matches(productCode)) ?? null;
}

export function isProductHidden(productCode: ProductCode | null | undefined): boolean {
  return Boolean(getProductHiddenRule(productCode));
}

export function getProductHiddenReason(productCode: ProductCode | null | undefined): string | null {
  return getProductHiddenRule(productCode)?.reason ?? null;
}

export function getEffectiveProductStatus(
  status: ProductStatus,
  productCode: ProductCode | null | undefined
): ProductVisibilityStatus {
  return isProductHidden(productCode) ? "hidden" : status;
}

export function matchesVisibilityStatus(
  effectiveStatus: ProductVisibilityStatus,
  requestedStatus: string
): boolean {
  return !requestedStatus || requestedStatus === "all" || effectiveStatus === requestedStatus;
}

/**
 * Year extraction shared by the Next app and scripts/auto-link-groups.mjs.
 *
 * This is plain .mjs on purpose: the auto-link script runs under bare Node and
 * cannot import TypeScript, and the two implementations previously drifted
 * (the script read compatibility items' `modelo`, the app did not), so the same
 * product could match a coarse group in one and not the other. Import this
 * module from both instead of re-implementing the logic.
 */

/** @typedef {{ modelo?: unknown }} CompatibilityItem */
/**
 * @typedef {{
 *   description_data?: { displayName?: unknown, generated?: unknown } | null,
 *   compatibility_data?: { generated?: unknown, items?: CompatibilityItem[] | null } | null,
 * } | null | undefined} ProductCodeLike
 */

/** Four-digit years in the 1900s/2000s. */
export const YEAR_PATTERN = /\b(?:19|20)\d{2}\b/g;

/**
 * @param {unknown} value
 * @returns {number[]}
 */
export function parseYears(value) {
  if (value === null || value === undefined) return [];

  const matches = String(value).match(YEAR_PATTERN) ?? [];

  return matches.map(Number).filter(Number.isFinite);
}

/**
 * Every year mentioned anywhere in a product's source record.
 *
 * This is the union of what the app and the script each used to read
 * separately, so it finds strictly more year evidence than either did alone.
 *
 * @param {ProductCodeLike} productCode
 * @returns {number[]}
 */
export function getProductSourceYears(productCode) {
  const items = productCode?.compatibility_data?.items ?? [];

  return [
    ...parseYears(productCode?.description_data?.displayName),
    ...parseYears(productCode?.description_data?.generated),
    ...parseYears(productCode?.compatibility_data?.generated),
    ...(Array.isArray(items) ? items.flatMap((item) => parseYears(item?.modelo)) : []),
  ];
}

/**
 * Does a product's source years fall inside a group's year range?
 *
 * A product with no year evidence at all is treated as a match rather than
 * excluded — the source data is frequently missing years, and excluding those
 * products would empty out most coarse groups.
 *
 * @param {ProductCodeLike} productCode
 * @param {number | null} yearStart
 * @param {number | null} yearEnd
 * @returns {boolean}
 */
export function hasProductYearOverlap(productCode, yearStart, yearEnd) {
  if (yearStart === null || yearStart === undefined) {
    if (yearEnd === null || yearEnd === undefined) return true;
  }

  const years = getProductSourceYears(productCode);

  if (years.length === 0) return true;

  const start = yearStart ?? yearEnd;
  const end = yearEnd ?? yearStart;

  return years.some((year) => year >= Number(start) && year <= Number(end));
}

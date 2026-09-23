const SEARCH_COLUMNS = [
  "name",
  "slug",
  "description",
  "model",
  "sub_model",
  "version",
  "additional",
  "other",
];

/**
 * Builds a PostgREST logical filter for a literal case-insensitive substring.
 *
 * @param {string} search
 * @returns {string | null}
 */
export function buildProductGroupSearchFilter(search) {
  const safeSearch = search
    .normalize("NFKC")
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!safeSearch) return null;

  // First escape PostgreSQL ILIKE metacharacters, then escape backslashes and
  // quotes for PostgREST's quoted logical-filter value.
  const literalSearch = safeSearch.replace(/[\\%_]/g, "\\$&");
  const quotedSearch = literalSearch
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
  const pattern = `"%${quotedSearch}%"`;

  return SEARCH_COLUMNS.map((column) => `${column}.ilike.${pattern}`).join(",");
}

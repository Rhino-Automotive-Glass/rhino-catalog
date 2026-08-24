type IntParamOptions = {
  /** Used when the param is absent, blank, or not a finite number. */
  fallback: number;
  /** Lower clamp applied to a valid value (default 1). */
  min?: number;
  /** Upper clamp applied to a valid value, when set. */
  max?: number;
};

/**
 * Parse an integer query param, clamped to the given bounds.
 *
 * `Number("abc")` is NaN and `Math.max(1, NaN)` is NaN, so clamping a raw
 * `Number(...)` lets NaN through into `.range()` calls and blows up the query.
 * Anything non-finite falls back instead.
 */
export function parseIntParam(
  value: string | null | undefined,
  { fallback, min = 1, max }: IntParamOptions
): number {
  if (value === null || value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const bounded = Math.max(min, Math.trunc(parsed));

  return max === undefined ? bounded : Math.min(max, bounded);
}

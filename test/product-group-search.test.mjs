import assert from "node:assert/strict";
import test from "node:test";

import { buildProductGroupSearchFilter } from "../src/lib/product-group-search.mjs";

test("quotes dots and preserves them as literal search text", () => {
  const filter = buildProductGroupSearchFilter("Transit 110.2");

  assert.match(filter, /^name\.ilike\."%Transit 110\.2%",/);
});

test("escapes ilike wildcards and literal backslashes", () => {
  const filter = buildProductGroupSearchFilter(String.raw`50%_\off`);

  assert.match(filter, /^name\.ilike\."%50\\\\%\\\\_\\\\\\\\off%",/);
});

test("normalizes commas and parentheses before building filters", () => {
  const filter = buildProductGroupSearchFilter("Sprinter, Jumbo (5.0)");

  assert.match(filter, /^name\.ilike\."%Sprinter Jumbo 5\.0%",/);
});

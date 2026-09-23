import assert from "node:assert/strict";
import test from "node:test";

import { isCrossSiteRequestHeaders } from "../src/lib/request-origin.mjs";

test("rejects requests marked cross-site", () => {
  assert.equal(
    isCrossSiteRequestHeaders({
      secFetchSite: "cross-site",
      origin: "https://catalog.example",
      host: "catalog.example",
      forwardedProto: "https",
      fallbackProtocol: "https:",
    }),
    true
  );
});

test("accepts matching scheme and host", () => {
  assert.equal(
    isCrossSiteRequestHeaders({
      secFetchSite: null,
      origin: "https://catalog.example",
      host: "catalog.example",
      forwardedProto: "https",
      fallbackProtocol: "http:",
    }),
    false
  );
});

test("rejects matching host with mismatched scheme", () => {
  assert.equal(
    isCrossSiteRequestHeaders({
      secFetchSite: null,
      origin: "http://catalog.example",
      host: "catalog.example",
      forwardedProto: "https",
      fallbackProtocol: "https:",
    }),
    true
  );
});

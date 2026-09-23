import assert from "node:assert/strict";
import test from "node:test";

import {
  commitUploadedImage,
  removeImageAt,
} from "../src/lib/image-upload-state.mjs";

test("rejects a completed upload when latest image list already reached max", () => {
  const latestUrls = ["one.jpg", "two.jpg", "three.jpg"];

  const result = commitUploadedImage(latestUrls, "late.jpg", 3);

  assert.deepEqual(result, {
    accepted: false,
    urls: latestUrls,
    rejectedUrl: "late.jpg",
  });
});

test("appends a completed upload to latest image list below max", () => {
  const result = commitUploadedImage(["one.jpg"], "two.jpg", 3);

  assert.deepEqual(result, {
    accepted: true,
    urls: ["one.jpg", "two.jpg"],
    rejectedUrl: null,
  });
});

test("removes from latest image list before asynchronous cleanup", () => {
  assert.deepEqual(removeImageAt(["one.jpg", "two.jpg"], 0), {
    removedUrl: "one.jpg",
    urls: ["two.jpg"],
  });
});

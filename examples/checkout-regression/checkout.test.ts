import test from "node:test";
import assert from "node:assert/strict";
import { freeShipping } from "./checkout.ts";

test("orders over the threshold receive free shipping", () => {
  assert.equal(freeShipping(60), true);
});

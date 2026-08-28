import test from "node:test";
import assert from "node:assert/strict";
import { freeShipping } from "./checkout.ts";

test("checkout requirement", () => {
  assert.equal(freeShipping(50), true);
});

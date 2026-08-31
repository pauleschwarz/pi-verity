import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  contradictedEffects,
  proveEffects,
  uncheckedEffects,
} from "../src/core/effect-proof.js";
import type { ObservableClaim } from "../src/core/types.js";

async function rootWith(content: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pi-verity-effect-"));
  await writeFile(join(root, "ui.tsx"), content);
  return root;
}

test("source observes present literals and contradicts absent ones", async () => {
  const root = await rootWith('export const label = "Buy now";\n');
  const claims: ObservableClaim[] = [
    { id: "claim-1", kind: "EXACT_TEXT_PRESENT", expected: "Buy now" },
    { id: "claim-2", kind: "EXACT_TEXT_ABSENT", expected: "Buy now" },
  ];
  const evidence = await proveEffects({ root, claims });
  assert.equal(evidence.claims[0]?.status, "SOURCE_OBSERVED");
  assert.equal(evidence.claims[1]?.status, "SOURCE_CONTRADICTED");
  assert.equal(contradictedEffects(evidence).length, 1);
});

test("missing present literal stays unchecked without a runtime", async () => {
  const root = await rootWith("export const label = 'other';\n");
  const evidence = await proveEffects({
    root,
    claims: [{ id: "claim-1", kind: "EXACT_TEXT_PRESENT", expected: "Buy now" }],
  });
  assert.equal(evidence.claims[0]?.status, "UNCHECKED");
  assert.equal(uncheckedEffects(evidence).length, 1);
});

test("runtime sensor can prove or contradict when source cannot", async () => {
  const root = await rootWith("export const label = 'other';\n");
  const claim: ObservableClaim = {
    id: "claim-1",
    kind: "EXACT_TEXT_PRESENT",
    expected: "Buy now",
  };
  const pass = await proveEffects({
    root,
    claims: [claim],
    runtime: {
      async observe() {
        return "Buy now";
      },
    },
  });
  assert.equal(pass.claims[0]?.status, "RUNTIME_OBSERVED");
  const fail = await proveEffects({
    root,
    claims: [claim],
    runtime: {
      async observe() {
        return "Nope";
      },
    },
  });
  assert.equal(fail.claims[0]?.status, "RUNTIME_CONTRADICTED");
});

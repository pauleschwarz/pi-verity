import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addProbeHint,
  createTurnContract,
  isEmptyContract,
  renderContractContext,
} from "../src/core/turn-contract.js";

test("createTurnContract captures claims and starts with empty hints", () => {
  const contract = createTurnContract('add "Hello world"');
  assert.equal(contract.claims.length, 1);
  assert.deepEqual(contract.hints, []);
  assert.equal(isEmptyContract(contract), false);
});

test("addProbeHint accepts location only and rejects unknown claim ids", () => {
  const contract = createTurnContract('add "Hello world"');
  const claimId = contract.claims[0]?.id;
  assert.ok(claimId !== undefined);
  assert.equal(
    addProbeHint(contract, {
      claim_id: claimId,
      file: "src/ui.tsx",
      route: "/home",
    }),
    true,
  );
  assert.equal(addProbeHint(contract, { claim_id: "missing" }), false);
  assert.equal(contract.hints[0]?.file, "src/ui.tsx");
  assert.equal(contract.hints[0]?.route, "/home");
});

test("renderContractContext is empty without claims and stays under the hard token budget", () => {
  assert.equal(renderContractContext(undefined), undefined);
  assert.equal(renderContractContext(createTurnContract("make it nicer")), undefined);
  const text = renderContractContext(
    createTurnContract('add "Alpha" and remove "Beta"'),
  );
  assert.ok(text !== undefined);
  assert.match(text, /Verity turn contract/);
  assert.match(text, /verity_check/);
});

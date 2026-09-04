import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { SCHEMA_VERSION } from "../src/core/types.js";

interface ReceiptSchema {
  $id: string;
  required: string[];
  properties: { schema_version: { const: number } };
  $defs: Record<
    string,
    { required?: string[]; properties?: Record<string, { enum?: string[] }> }
  >;
}

const schemaDirectory = join(import.meta.dirname, "..", "schemas");

async function loadSchema(file: string): Promise<ReceiptSchema> {
  return JSON.parse(
    await readFile(join(schemaDirectory, file), "utf8"),
  ) as ReceiptSchema;
}

const v3 = await loadSchema("proof-receipt.v3.schema.json");
const v4 = await loadSchema("proof-receipt.v4.schema.json");
const v5 = await loadSchema("proof-receipt.v5.schema.json");

test("historical v3 schema stays frozen at version 3", () => {
  assert.equal(v3.$id, "urn:pi-verity:schema:proof-receipt:v3");
  assert.equal(v3.properties.schema_version.const, 3);
  assert.equal(v3.required.includes("test_delta"), false);
  assert.equal(v3.required.includes("effect_evidence"), false);
  assert.equal(v3.required.includes("external_evidence"), false);
});

test("historical v4 schema stays frozen at version 4", () => {
  assert.equal(v4.$id, "urn:pi-verity:schema:proof-receipt:v4");
  assert.equal(v4.properties.schema_version.const, 4);
  assert.equal(v4.required.includes("test_delta"), true);
  assert.equal(v4.required.includes("effect_evidence"), true);
  assert.equal(v4.required.includes("external_evidence"), false);
});

test("current schema matches the source schema version", () => {
  assert.equal(v5.$id, "urn:pi-verity:schema:proof-receipt:v5");
  assert.equal(v5.properties.schema_version.const, SCHEMA_VERSION);
});

test("current schema declares the version 5 evidence contract", () => {
  assert.equal(v5.required.includes("test_delta"), true);
  assert.equal(v5.required.includes("effect_evidence"), true);
  assert.equal(v5.required.includes("external_evidence"), true);
  assert.deepEqual(v5.$defs.externalEvidence?.required, [
    "provider",
    "status",
    "subject_bound",
    "run_id",
    "report_hash",
    "report_path",
    "issue_count",
    "detail",
  ]);
  assert.deepEqual(v5.$defs.externalEvidence?.properties?.status.enum, [
    "PASS",
    "FAIL",
    "INCOMPLETE",
    "UNAVAILABLE",
    "MALFORMED",
  ]);
  assert.equal(v5.$defs.commandResult?.required?.includes("narrowing"), true);
  assert.equal(v5.$defs.counterfactualEvidence?.required?.includes("narrowing"), true);
  assert.deepEqual(v5.$defs.effectObservation?.required, [
    "claim_id",
    "kind",
    "expected",
    "observed",
    "status",
  ]);
  assert.deepEqual(v5.$defs.effectObservation?.properties?.status.enum, [
    "SOURCE_OBSERVED",
    "RUNTIME_OBSERVED",
    "UNCHECKED",
    "SOURCE_CONTRADICTED",
    "RUNTIME_CONTRADICTED",
  ]);
  assert.equal(
    v5.$defs.scopeSignal?.properties?.code.enum?.includes("SCOPE_TEST_RENAMED"),
    true,
  );
});

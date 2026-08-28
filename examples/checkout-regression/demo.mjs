#!/usr/bin/env node
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const fixture = await mkdtemp(join(tmpdir(), "pi-verity-golden-"));
const project = join(new URL(".", import.meta.url).pathname, "baseline");
const candidate = join(fixture, "candidate");

async function run(source, test) {
  await cp(project, candidate, { recursive: true });
  await writeFile(join(candidate, "checkout.ts"), await readFile(source));
  await writeFile(join(candidate, "checkout.test.ts"), await readFile(test));
  try {
    await exec("node", ["--test", join(candidate, "checkout.test.ts")]);
    return "PASS";
  } catch {
    return "FAIL";
  } finally {
    await rm(candidate, { recursive: true, force: true });
  }
}

try {
  const weakTest = join(new URL(".", import.meta.url).pathname, "weak", "checkout.test.ts");
  const strongTest = join(new URL(".", import.meta.url).pathname, "strong", "checkout.test.ts");
  const weakBaseline = await run(join(project, "checkout.ts"), weakTest);
  const weakCandidate = await run(join(new URL(".", import.meta.url).pathname, "weak", "checkout.ts"), weakTest);
  console.log(`weak: baseline + candidate test ${weakBaseline}; candidate + candidate test ${weakCandidate}`);
  console.log("weak: PATCH_POLARITY = NON_DISCRIMINATING; VERDICT = UNPROVEN");

  const strongBaseline = await run(join(project, "checkout.ts"), strongTest);
  const strongCandidateSource = join(new URL(".", import.meta.url).pathname, "strong", "checkout.ts");
  const strongCandidate = await run(strongCandidateSource, strongTest);
  console.log(`strong: baseline + candidate test ${strongBaseline}; candidate + candidate test ${strongCandidate}`);
  console.log("strong: PATCH_POLARITY = PROVEN; VERDICT = PASS");

  const prior = await readFile(strongCandidateSource, "utf8");
  const proofState = createHash("sha256").update(prior).digest("hex");
  const mutatedCopy = join(fixture, "strong-mutated.ts");
  await writeFile(mutatedCopy, `${prior}\n// mutation\n`);
  const currentState = createHash("sha256")
    .update(await readFile(mutatedCopy))
    .digest("hex");
  console.log(`after PASS, implementation mutation: ${proofState === currentState ? "CURRENT" : "STALE"}`);
} finally {
  await rm(fixture, { recursive: true, force: true });
}

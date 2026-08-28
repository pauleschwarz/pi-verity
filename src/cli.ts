#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { formatDoctorReport, runDoctor } from "./core/doctor.js";
import { canonicalJson } from "./core/hash.js";
import type { VerifyOptions } from "./core/types.js";
import { verifyRepository } from "./core/verifier.js";

function usage(): never {
  process.stderr.write(
    "Usage: pi-verity verify [repository] [--output receipt.json] [--timeout-ms N] [--max-output-bytes N] | doctor [repository]\n",
  );
  process.exit(2);
}

const args = process.argv.slice(2);
const subcommand = args.shift();
if (subcommand === "doctor") {
  const repository = args.shift();
  if (args.length > 0) usage();
  const report = await runDoctor(
    repository === undefined ? process.cwd() : resolve(repository),
  );
  process.stdout.write(`${formatDoctorReport(report)}\n`);
  process.exit(report.ready ? 0 : 1);
}
if (subcommand !== "verify") usage();
let cwd = process.cwd();
let output: string | undefined;
let timeoutMs: number | undefined;
let maxOutputBytes: number | undefined;
while (args.length > 0) {
  const arg = args.shift();
  if (arg === undefined) usage();
  if (arg === "--output") output = args.shift() ?? usage();
  else if (arg === "--timeout-ms") timeoutMs = Number(args.shift() ?? usage());
  else if (arg === "--max-output-bytes")
    maxOutputBytes = Number(args.shift() ?? usage());
  else if (arg.startsWith("-")) usage();
  else cwd = resolve(arg);
}
if (
  (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) ||
  (maxOutputBytes !== undefined &&
    (!Number.isFinite(maxOutputBytes) || maxOutputBytes <= 0))
)
  usage();

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
const options: VerifyOptions = { cwd, signal: controller.signal };
if (timeoutMs !== undefined) options.timeoutMs = timeoutMs;
if (maxOutputBytes !== undefined) options.maxOutputBytes = maxOutputBytes;
const receipt = await verifyRepository(options);
const serialized = `${canonicalJson(receipt)}\n`;
if (output === undefined) process.stdout.write(serialized);
else
  await writeFile(resolve(output), serialized, {
    encoding: "utf8",
    mode: 0o600,
  });
process.stderr.write(`pi-verity: ${receipt.verdict}\n`);
if (receipt.verdict === "PASS" || receipt.verdict === "PASS_WITH_WARNINGS")
  process.exitCode = 0;
else if (receipt.verdict === "FAIL") process.exitCode = 1;
else process.exitCode = 2;

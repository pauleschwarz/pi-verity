#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { formatVerdictLine } from "./core/display.js";
import { formatDoctorReport, runDoctor } from "./core/doctor.js";
import { canonicalJson } from "./core/hash.js";
import type { VerifyOptions } from "./core/types.js";
import { verifyRepository } from "./core/verifier.js";

function usage(error?: string): never {
  const text =
    "Verity checks whether repository evidence supports claiming the work is done.\n\n" +
    "Usage:\n" +
    "  verity doctor [repository]\n" +
    "  verity verify [repository] [--output receipt.json] [--timeout-ms N] [--max-output-bytes N]\n" +
    "               [--visual-qa-report report.json] [--visual-qa-subject-bound]\n" +
    "  verity --version\n\n" +
    "verify writes a JSON receipt. Without --output, JSON goes to stdout.\n" +
    "The human verdict line goes to stderr.\n\n" +
    "Verdicts:\n" +
    "  Proven                 required checks passed\n" +
    "  Proven, with notes     passed, but something needs attention\n" +
    "  Not proven             evidence missing or inconclusive; do not claim done\n" +
    "  Failed                 a required check failed\n\n" +
    "Exit: 0 proven / 1 failed / 2 not proven or bad usage\n" +
    "Legacy alias: pi-verity\n";
  if (error === undefined) {
    process.stdout.write(text);
    process.exit(0);
  }
  process.stderr.write(`Verity: ${error}\n\n${text}`);
  process.exit(2);
}

const args = process.argv.slice(2);
const subcommand = args.shift();
if (subcommand === undefined || subcommand === "help" || subcommand === "--help") {
  usage();
}
if (subcommand === "--version" || subcommand === "-v") {
  const { VERSION } = await import("./core/doctor.js");
  process.stdout.write(`${VERSION}\n`);
  process.exit(0);
}
if (subcommand === "doctor") {
  const repository = args.shift();
  if (args.length > 0) usage();
  const report = await runDoctor(
    repository === undefined ? process.cwd() : resolve(repository),
  );
  process.stdout.write(`${formatDoctorReport(report)}\n`);
  process.exit(report.ready ? 0 : 1);
}
if (subcommand !== "verify") usage(`unknown command: ${subcommand}`);
let cwd = process.cwd();
let output: string | undefined;
let timeoutMs: number | undefined;
let maxOutputBytes: number | undefined;
let visualQaReport: string | undefined;
let visualQaSubjectBound = false;
while (args.length > 0) {
  const arg = args.shift();
  if (arg === undefined) usage();
  if (arg === "--output") output = args.shift() ?? usage();
  else if (arg === "--timeout-ms") timeoutMs = Number(args.shift() ?? usage());
  else if (arg === "--max-output-bytes")
    maxOutputBytes = Number(args.shift() ?? usage());
  else if (arg === "--visual-qa-report") visualQaReport = args.shift() ?? usage();
  else if (arg === "--visual-qa-subject-bound") visualQaSubjectBound = true;
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
if (visualQaSubjectBound && visualQaReport === undefined)
  usage("--visual-qa-subject-bound requires --visual-qa-report");
if (visualQaReport !== undefined) {
  const { loadVisualQaEvidence } = await import("./core/external-evidence.js");
  options.externalEvidence = [
    await loadVisualQaEvidence({
      reportPath: resolve(visualQaReport),
      subjectBound: visualQaSubjectBound,
    }),
  ];
}
const receipt = await verifyRepository(options);
const serialized = `${canonicalJson(receipt)}\n`;
if (output === undefined) process.stdout.write(serialized);
else
  await writeFile(resolve(output), serialized, {
    encoding: "utf8",
    mode: 0o600,
  });
process.stderr.write(`${formatVerdictLine(receipt.verdict)}\n`);
if (receipt.verdict === "PASS" || receipt.verdict === "PASS_WITH_WARNINGS")
  process.exitCode = 0;
else if (receipt.verdict === "FAIL") process.exitCode = 1;
else process.exitCode = 2;

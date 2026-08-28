import { execFile } from "node:child_process";
import { lstat, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { captureGitSnapshot } from "../../src/core/git.js";
import { verifyRepository } from "../../src/core/verifier.js";
import { captureCounterfactualBaseline } from "../../src/core/workspace.js";

const execFileAsync = promisify(execFile);
const SAMPLE_COUNT = 5;
const root = await mkdtemp(join(tmpdir(), "pi-verity-benchmark-"));

async function run(command: string, args: string[] = []): Promise<string> {
  const result = await execFileAsync(command, args, { encoding: "utf8" });
  return result.stdout.trim();
}

async function git(...args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: root });
}

async function resetFixture(): Promise<void> {
  await git("reset", "--hard", "-q", "HEAD");
  await git("clean", "-fdq");
}

async function directoryBytes(path: string): Promise<number> {
  const entry = await lstat(path);
  if (!entry.isDirectory()) return entry.size;
  let bytes = 0;
  for (const child of await readdir(path)) bytes += await directoryBytes(join(path, child));
  return bytes;
}

async function setup(): Promise<void> {
  await git("init", "-q");
  await git("config", "user.email", "benchmark@example.invalid");
  await git("config", "user.name", "Pi Verity Benchmark");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ type: "module", scripts: { test: "node --test" } }) + "\n",
  );
  await writeFile(join(root, "source.js"), "export function enabled() { return false; }\n");
  await writeFile(
    join(root, "behavior.test.js"),
    'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { enabled } from "./source.js";\ntest("enabled", () => assert.equal(enabled(), true));\n',
  );
  await git("add", ".");
  await git("commit", "-qm", "benchmark baseline");
}

type Scenario = "no-change" | "small-source-patch" | "deterministic-proof" | "counterfactual-proof";
interface Sample {
  duration_ms: number;
  verification_subprocesses: number;
  workspace_bytes: number;
  verdict: string;
  counterfactual: string | null;
}

async function measure(scenario: Scenario): Promise<Sample> {
  await resetFixture();
  const baseline = await captureGitSnapshot(root);
  let counterfactualBaseline;
  if (scenario === "counterfactual-proof")
    counterfactualBaseline = await captureCounterfactualBaseline(root);
  if (scenario !== "no-change")
    await writeFile(join(root, "source.js"), "export function enabled() { return true; }\n");
  const started = performance.now();
  const receipt = await verifyRepository({
    cwd: root,
    baseline,
    ...(counterfactualBaseline === undefined ? {} : { counterfactualBaseline }),
  });
  const duration_ms = Math.round(performance.now() - started);
  const workspace_bytes = receipt.counterfactual?.workspace_bytes ?? 0;
  await counterfactualBaseline?.cleanup();
  const counterfactualRuns =
    receipt.counterfactual?.baseline_result !== null &&
    receipt.counterfactual?.candidate_result !== null &&
    receipt.counterfactual !== null
      ? 2
      : 0;
  return {
    duration_ms,
    verification_subprocesses: receipt.verification_commands.length + counterfactualRuns,
    workspace_bytes,
    verdict: receipt.verdict,
    counterfactual: receipt.counterfactual?.classification ?? null,
  };
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

async function main(): Promise<void> {
  await setup();
  const scenarios: Record<Scenario, Sample[]> = {
    "no-change": [],
    "small-source-patch": [],
    "deterministic-proof": [],
    "counterfactual-proof": [],
  };
  for (const scenario of Object.keys(scenarios) as Scenario[])
    for (let sample = 0; sample < SAMPLE_COUNT; sample += 1)
      scenarios[scenario]?.push(await measure(scenario));

  const metadata = {
    generated_at: new Date().toISOString(),
    node: process.version,
    npm: await run("npm", ["--version"]),
    git: await run("git", ["--version"]),
    pi: await run("pi", ["--version"]),
    commit: await run("git", ["rev-parse", "HEAD"]),
    os: `${platform()} ${release()} ${arch()}`,
    cpu: cpus()[0]?.model ?? "unknown",
    cpu_count: cpus().length,
    fixture_bytes_after_setup: await directoryBytes(root),
    sample_count: SAMPLE_COUNT,
    llm_calls: 0,
    llm_tokens: 0,
    llm_note: "Deterministic verifier run; no Pi session or LLM request was used.",
  };
  const output = Object.fromEntries(
    Object.entries(scenarios).map(([name, samples]) => [
      name,
      {
        samples,
        wall_clock_ms: {
          median: percentile(samples.map((sample) => sample.duration_ms), 50),
          p95: percentile(samples.map((sample) => sample.duration_ms), 95),
        },
        verification_subprocesses: samples.map((sample) => sample.verification_subprocesses),
        workspace_bytes: samples.map((sample) => sample.workspace_bytes),
      },
    ]),
  );
  process.stdout.write(`${JSON.stringify({ metadata, scenarios: output }, null, 2)}\n`);
}

try {
  await main();
} finally {
  await rm(root, { recursive: true, force: true });
}

import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverVerification } from "./discovery.js";
import { findRepositoryRoot, NotGitRepositoryError } from "./git.js";

export const VERSION = "0.1.2";

export type DoctorStatus = "OK" | "WARN" | "ERROR";

export interface DoctorCheck {
  status: DoctorStatus;
  label: string;
  detail: string | null;
}

export interface DoctorReport {
  version: string;
  repository_root: string | null;
  checks: DoctorCheck[];
  ready: boolean;
}

function check(status: DoctorStatus, label: string, detail?: string): DoctorCheck {
  return { status, label, detail: detail ?? null };
}

async function readable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function packageManager(root: string): Promise<string | null> {
  const lockfiles: [string, string][] = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lockb", "bun"],
    ["bun.lock", "bun"],
    ["package-lock.json", "npm"],
  ];
  for (const [file, name] of lockfiles) {
    if (await readable(join(root, file))) return name;
  }
  return (await readable(join(root, "package.json"))) ? "npm" : null;
}

function scriptCommand(manager: string, name: string): string {
  return manager === "npm" ? `${manager} run ${name}` : `${manager} ${name}`;
}

interface PackageJson {
  scripts?: unknown;
}

function stringScripts(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [name, command] of Object.entries(value)) {
    if (typeof command === "string") result[name] = command;
  }
  return result;
}

async function packageScripts(
  root: string,
  manager: string | null,
): Promise<Record<string, string>> {
  if (manager === null || !(await readable(join(root, "package.json")))) return {};
  try {
    const parsed = JSON.parse(
      await readFile(join(root, "package.json"), "utf8"),
    ) as PackageJson;
    return stringScripts(parsed.scripts);
  } catch {
    return {};
  }
}

async function workspaceSupported(): Promise<DoctorCheck> {
  let parent: string | undefined;
  try {
    parent = await mkdtemp(join(tmpdir(), "pi-verity-doctor-"));
    return check("OK", "isolated counterfactual workspace supported");
  } catch (error) {
    return check(
      "ERROR",
      "isolated counterfactual workspace unavailable",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    if (parent !== undefined) await rm(parent, { recursive: true, force: true });
  }
}

/**
 * Read-only capability diagnostic. Performs no LLM call, no network request and
 * no repository mutation. The only filesystem write is a temporary directory in
 * the OS temp location, created to prove workspace isolation works and removed
 * immediately.
 */
export async function runDoctor(cwd: string): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [
    check("OK", "extension loaded", `pi-verity ${VERSION}`),
  ];

  let root: string | null = null;
  try {
    root = await findRepositoryRoot(cwd);
    checks.push(check("OK", "git repository", root));
    checks.push(check("OK", "baseline capture available"));
  } catch (error) {
    if (!(error instanceof NotGitRepositoryError)) throw error;
    checks.push(check("ERROR", "not inside a Git repository", cwd));
    checks.push(
      check("ERROR", "baseline capture unavailable", "requires a Git repository"),
    );
  }

  if (root !== null) {
    const manager = await packageManager(root);
    checks.push(
      manager === null
        ? check(
            "WARN",
            "no Node package manager discovered",
            "no package.json or lockfile at the repository root",
          )
        : check("OK", `package manager: ${manager}`),
    );

    const discovery = await discoverVerification(root);
    const scripts = await packageScripts(root, manager);
    const test = discovery.commands.find((command) => command.kind === "test");
    checks.push(
      test === undefined
        ? check(
            "ERROR",
            "no test command discovered",
            "counterfactual proof requires a repository-defined test command",
          )
        : check("OK", `test command: ${test.command.join(" ")}`),
    );

    const typecheckName = ["typecheck", "check"].find(
      (name) => typeof scripts[name] === "string",
    );
    checks.push(
      typecheckName === undefined
        ? check(
            "WARN",
            "no typecheck command discovered",
            "verification will not include a type-level check",
          )
        : check("OK", `typecheck: ${scriptCommand(manager ?? "npm", typecheckName)}`),
    );

    for (const warning of discovery.warnings) {
      checks.push(check("WARN", "discovery warning", warning));
    }
  }

  checks.push(await workspaceSupported());

  return {
    version: VERSION,
    repository_root: root,
    checks,
    ready: !checks.some((item) => item.status === "ERROR"),
  };
}

const MARKER: Record<DoctorStatus, string> = {
  OK: "✓",
  WARN: "WARN",
  ERROR: "ERROR",
};

export function formatDoctorReport(report: DoctorReport): string {
  const lines = [`Pi Verity ${report.version}`, ""];
  for (const item of report.checks) {
    const detail =
      item.detail === null || item.status === "OK" ? "" : ` · ${item.detail}`;
    lines.push(`${MARKER[item.status]} ${item.label}${detail}`);
  }
  lines.push("");
  lines.push(report.ready ? "Ready." : "Not ready. Resolve the ERROR items above.");
  return lines.join("\n");
}

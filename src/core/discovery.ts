import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { VerificationCommand } from "./types.js";

export interface DiscoveryResult {
  commands: VerificationCommand[];
  warnings: string[];
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

const destructive =
  /(?:^|[;&|]\s*)(?:sudo\s+)?(?:rm\s+-[^\n]*r|git\s+(?:clean|reset)|npm\s+publish|cargo\s+publish|go\s+clean|[^\n]*(?:deploy|push)\b)/i;
const unverifiedNarrowing =
  /[*?{}[\]]|&&|\|\||[;&|<>]|\$\(|\b(?:npm|pnpm|yarn|bun)\s+(?:run|exec)\b/;

function commandKind(name: string): "test" | "lint" | "check" {
  if (name === "test") return "test";
  if (name === "lint") return "lint";
  return "check";
}

async function nodeRunner(root: string): Promise<string> {
  const [pnpm, yarn, bunLock, bunTextLock] = await Promise.all([
    exists(join(root, "pnpm-lock.yaml")),
    exists(join(root, "yarn.lock")),
    exists(join(root, "bun.lockb")),
    exists(join(root, "bun.lock")),
  ]);
  if (pnpm) return "pnpm";
  if (yarn) return "yarn";
  return bunLock || bunTextLock ? "bun" : "npm";
}

export async function discoverVerification(root: string): Promise<DiscoveryResult> {
  const commands: VerificationCommand[] = [];
  const warnings: string[] = [];
  const packagePath = join(root, "package.json");

  if (await exists(packagePath)) {
    try {
      const parsed = JSON.parse(await readFile(packagePath, "utf8")) as {
        scripts?: unknown;
      };
      const scripts = parsed.scripts;
      if (
        scripts !== undefined &&
        (typeof scripts !== "object" || scripts === null || Array.isArray(scripts))
      ) {
        warnings.push("package.json has a malformed scripts field");
      } else {
        const record = (scripts ?? {}) as Record<string, unknown>;
        const preferred = ["test", "verify", "check", "typecheck", "lint"] as const;
        const name = preferred.find(
          (candidate) => typeof record[candidate] === "string",
        );
        if (name !== undefined) {
          const script = record[name] as string;
          if (destructive.test(script)) {
            warnings.push(
              `Refused potentially destructive package.json script: ${name}`,
            );
          } else {
            const runner = await nodeRunner(root);
            const args = runner === "yarn" || runner === "bun" ? [name] : ["run", name];
            commands.push({
              source: "package.json",
              kind: commandKind(name),
              command: [runner, ...args],
              narrowing: unverifiedNarrowing.test(script) ? "unverified" : "safe",
              packageScript: script,
            });
          }
        }
      }
    } catch (error) {
      warnings.push(
        `Malformed package.json: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const pyprojectPath = join(root, "pyproject.toml");
  if (commands.length === 0 && (await exists(pyprojectPath))) {
    try {
      const parsed = parseToml(await readFile(pyprojectPath, "utf8"));
      const tool = parsed.tool;
      const pytestConfigured =
        typeof tool === "object" && tool !== null && "pytest" in tool;
      if (pytestConfigured) {
        commands.push({
          source: "pyproject.toml",
          kind: "test",
          command: ["python3", "-m", "pytest"],
          narrowing: "safe",
        });
      }
    } catch (error) {
      warnings.push(
        `Malformed pyproject.toml: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (commands.length === 0 && (await exists(join(root, "Cargo.toml")))) {
    commands.push({
      source: "Cargo.toml",
      kind: "test",
      command: ["cargo", "test"],
      narrowing: "unverified",
    });
  }
  if (commands.length === 0 && (await exists(join(root, "go.mod")))) {
    commands.push({
      source: "go.mod",
      kind: "test",
      command: ["go", "test", "./..."],
      narrowing: "safe",
    });
  }

  return { commands, warnings };
}

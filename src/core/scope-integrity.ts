import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, type Dirent } from "node:fs";
import { lstat, open, readdir, readlink } from "node:fs/promises";
import { extname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import type {
  ScopeIntegrityEvidence,
  ScopeSeverity,
  ScopeSignal,
  ScopeSignalCode,
} from "./types.js";

const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_EVIDENCE_LINES = 6;
const BROAD_FILE_COUNT = 25;
const BROAD_AREA_COUNT = 10;
const MAX_SECRET_SCAN_FILES = 50_000;
const SCAN_EXCLUDED = new Set([".git", ".hg", ".svn", "node_modules"]);

const LOCKFILES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "Cargo.lock",
  "poetry.lock",
  "Pipfile.lock",
  "uv.lock",
  "composer.lock",
  "Gemfile.lock",
  "go.sum",
]);
const PACKAGE_BUILD_CONFIG =
  /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|composer\.json|Gemfile|Makefile|CMakeLists\.txt|Dockerfile|tsconfig(?:\.[^/]*)?\.json|vite\.config\.[^/]+|webpack\.config\.[^/]+|rollup\.config\.[^/]+|build\.gradle(?:\.kts)?|pom\.xml)$/i;
const TEST_PATH =
  /(^|\/)(test|tests|__tests__|spec)(\/|$)|(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$/i;
const MIGRATION_PATH = /(^|\/)(migrations?|db\/migrate|alembic\/versions)(\/|$)/i;
const GENERATED_PATH =
  /(^|\/)(dist|build|coverage|generated|gen|vendor|\.next|target)(\/|$)|(?:\.min\.(?:js|css)|\.generated\.[^/]+|\.g\.(?:cs|ts))$/i;
const GENERATED_MARKER =
  /(?:code generated|auto[- ]generated|generated file|do not edit)/i;
const BINARY_EXTENSION =
  /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|7z|woff2?|ttf|eot|class|jar|so|dylib|dll|exe|bin|wasm)$/i;
const SECRET_LIKE_PATH =
  /(^|\/)(?:\.env(?:\.[^/]+)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|credentials?\.(?:json|ya?ml|toml)|secrets?\.(?:json|ya?ml|toml)|service[-_]?account\.json|[^/]+\.(?:pem|p12|pfx|key|keystore))$/i;
const SECRET_TEMPLATE_PATH = /(^|\/)\.env\.(?:example|sample|template)$/i;

interface FileVersion {
  exists: boolean;
  bytes: Buffer;
  digest: string;
}

interface Change {
  path: string;
  before: FileVersion;
  after: FileVersion;
}

export interface ScopeIntegrityOptions {
  root: string;
  changedFiles: string[];
  baselineDirectory?: string;
  baselineRef?: string;
  baselineDirty?: boolean;
}

function signal(
  severity: ScopeSeverity,
  code: ScopeSignalCode,
  file: string,
  observed: string,
  why: string,
  evidence: string[] = [],
): ScopeSignal {
  return {
    severity,
    code,
    file,
    observed,
    why,
    evidence: evidence.slice(0, MAX_EVIDENCE_LINES),
  };
}

function digestBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function digestFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function missingVersion(): FileVersion {
  return { exists: false, bytes: Buffer.alloc(0), digest: "" };
}

async function diskVersion(path: string): Promise<FileVersion> {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) {
      const bytes = Buffer.from(`symlink:${await readlink(path)}`, "utf8");
      return { exists: true, bytes, digest: digestBytes(bytes) };
    }
    if (!stat.isFile()) return missingVersion();
    const handle = await open(path, "r");
    try {
      const bytes = Buffer.alloc(Math.min(stat.size, MAX_FILE_BYTES));
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      return {
        exists: true,
        bytes: bytes.subarray(0, bytesRead),
        digest: await digestFile(path),
      };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return missingVersion();
    throw error;
  }
}

async function gitVersion(
  root: string,
  ref: string,
  path: string,
): Promise<FileVersion> {
  try {
    const result = await execFileAsync("git", ["show", `${ref}:${path}`], {
      cwd: root,
      encoding: "buffer",
      maxBuffer: MAX_FILE_BYTES,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
    });
    const bytes = result.stdout.subarray(0, MAX_FILE_BYTES);
    return { exists: true, bytes, digest: digestBytes(bytes) };
  } catch {
    try {
      await execFileAsync("git", ["cat-file", "-e", `${ref}:${path}`], {
        cwd: root,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
      });
      return {
        exists: true,
        bytes: Buffer.alloc(0),
        digest: `unreadable-git-blob:${ref}:${path}`,
      };
    } catch {
      return missingVersion();
    }
  }
}

function isBinary(bytes: Buffer, path: string): boolean {
  if (BINARY_EXTENSION.test(path)) return true;
  return bytes.subarray(0, 8_192).includes(0);
}

function text(version: FileVersion): string {
  return version.exists && !isBinary(version.bytes, "")
    ? version.bytes.toString("utf8")
    : "";
}

function addedAndRemoved(
  before: string,
  after: string,
): {
  added: string[];
  removed: string[];
} {
  const beforeCounts = new Map<string, number>();
  const afterCounts = new Map<string, number>();
  for (const line of before.split(/\r?\n/)) {
    if (line.length > 0) beforeCounts.set(line, (beforeCounts.get(line) ?? 0) + 1);
  }
  for (const line of after.split(/\r?\n/)) {
    if (line.length > 0) afterCounts.set(line, (afterCounts.get(line) ?? 0) + 1);
  }
  const added: string[] = [];
  const removed: string[] = [];
  for (const [line, count] of afterCounts)
    for (let index = beforeCounts.get(line) ?? 0; index < count; index += 1)
      added.push(line);
  for (const [line, count] of beforeCounts)
    for (let index = afterCounts.get(line) ?? 0; index < count; index += 1)
      removed.push(line);
  return { added, removed };
}

function matching(lines: string[], pattern: RegExp): string[] {
  return lines.flatMap((line) => (pattern.test(line) ? [line.trim()] : []));
}

function observedChange(subject: string, added: boolean, deleted: boolean): string {
  if (added) return `${subject} added`;
  if (deleted) return `${subject} deleted`;
  return `${subject} changed`;
}

function dependencyEntries(path: string, source: string): Map<string, string> {
  const entries = new Map<string, string>();
  if (/(^|\/)package\.json$/i.test(path)) {
    try {
      type DependencySection =
        | "dependencies"
        | "devDependencies"
        | "peerDependencies"
        | "optionalDependencies";
      const parsed = JSON.parse(source) as Partial<
        Record<DependencySection, Record<string, string>>
      >;
      const sections: DependencySection[] = [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ];
      for (const section of sections) {
        const dependencies = parsed[section];
        if (dependencies === undefined) continue;
        for (const [name, version] of Object.entries(dependencies)) {
          entries.set(name, `${name}: ${safeDependencySpecifier(version)}`);
        }
      }
    } catch {
      return entries;
    }
  } else if (/(^|\/)(requirements[^/]*\.txt|Pipfile)$/i.test(path)) {
    for (const line of source.split(/\r?\n/)) {
      const clean = line.trim();
      if (clean && !clean.startsWith("#") && !clean.startsWith("-"))
        entries.set(clean.replace(/[<>=!~].*$/, ""), clean);
    }
  } else if (/(^|\/)(Cargo\.toml|pyproject\.toml)$/i.test(path)) {
    let inDependencies = false;
    for (const line of source.split(/\r?\n/)) {
      const heading = /^\s*\[([^\]]+)\]/.exec(line);
      if (heading)
        inDependencies = /(?:^|\.)(?:dev-|build-)?dependencies$/.test(heading[1] ?? "");
      else if (inDependencies) {
        const entry = /^\s*([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
        if (entry) entries.set(entry[1] ?? "", line.trim());
      }
    }
  } else if (/(^|\/)go\.mod$/i.test(path)) {
    for (const line of source.split(/\r?\n/)) {
      const entry = /^\s*([\w./-]+)\s+(v\S+)/.exec(line);
      const name = entry?.[1];
      if (name !== undefined && name !== "module" && name !== "go")
        entries.set(name, line.trim());
    }
  }
  return entries;
}

function safeDependencySpecifier(value: string): string {
  return /^[~^<>=*v0-9.xX|& -]+$/.test(value)
    ? value
    : "<non-version specifier redacted>";
}

function publicApiLines(path: string, lines: string[]): string[] {
  const extension = extname(path).toLowerCase();
  let pattern: RegExp | null = null;
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(extension))
    pattern =
      /^\s*(?:export\s+(?:(?:default\s+)?(?:async\s+)?(?:class|function|const|let|var|interface|type|enum)|(?:\{|\*))|module\.exports\b|exports\.[A-Za-z_$])/;
  else if (extension === ".py") pattern = /^\s*__all__\s*=/;
  else if (extension === ".rs")
    pattern = /^\s*pub\s+(?:async\s+)?(?:fn|struct|enum|trait|type|const|static|mod)\b/;
  else if (extension === ".go")
    pattern = /^\s*(?:func|type|var|const)\s+[A-Z][A-Za-z0-9_]*/;
  else if ([".java", ".kt", ".cs"].includes(extension))
    pattern = /^\s*public\s+(?:class|interface|enum|record|static|final|[A-Za-z_$])/;
  if (pattern === null) return [];
  return matching(lines, pattern).map((line) => {
    if (extension === ".py") return line;
    if (/\b(?:const|let|var|static)\b/.test(line))
      return line.replace(/\s*=.*$/, "").trim();
    return line.replace(/\s*\{.*$/, "").trim();
  });
}

function testDeclarationCount(source: string): number {
  let count = 0;
  for (const line of source.split(/\r?\n/)) {
    if (/\b(?:describe|context|it|test)(?:\.skip)?\s*\(\s*(["'`])[^"'`]+\1/.test(line))
      count += 1;
    if (/^\s*(?:async\s+)?def\s+test_[A-Za-z0-9_]*\s*\(/.test(line)) count += 1;
  }
  return count;
}

function inspectChange(change: Change): ScopeSignal[] {
  const signals: ScopeSignal[] = [];
  const { path, before, after } = change;
  const beforeText = text(before);
  const afterText = text(after);
  const { added } = addedAndRemoved(beforeText, afterText);
  const addedFile = !before.exists && after.exists;
  const deletedFile = before.exists && !after.exists;

  if (addedFile && SECRET_LIKE_PATH.test(path) && !SECRET_TEMPLATE_PATH.test(path))
    signals.push(
      signal(
        "FAIL",
        "SCOPE_SECRET_LIKE_FILE_ADDED",
        path,
        "secret-like filename added",
        "The added path matches a deterministic credential or secret filename pattern; file contents were not inspected or emitted.",
      ),
    );
  if (addedFile && isBinary(after.bytes, path))
    signals.push(
      signal(
        "WARNING",
        "SCOPE_BINARY_ADDED",
        path,
        "binary file added",
        "The added file has a known binary extension or contains a NUL byte, so line-level scope review is unavailable.",
      ),
    );
  if (LOCKFILES.has(path.split("/").at(-1) ?? ""))
    signals.push(
      signal(
        "INFORMATION",
        "SCOPE_LOCKFILE_CHANGED",
        path,
        observedChange("lockfile", addedFile, deletedFile),
        "The path is a recognized dependency lockfile. This records the observed change without judging whether it was needed.",
      ),
    );

  const beforeDependencies = dependencyEntries(path, beforeText);
  const afterDependencies = dependencyEntries(path, afterText);
  const dependenciesAdded = [...afterDependencies].flatMap(([key, value]) =>
    beforeDependencies.has(key) ? [] : [`+ ${value}`],
  );
  if (dependenciesAdded.length > 0)
    signals.push(
      signal(
        "WARNING",
        "SCOPE_DEPENDENCY_ADDED",
        path,
        `${dependenciesAdded.length} dependency entr${dependenciesAdded.length === 1 ? "y" : "ies"} added`,
        "A recognized dependency manifest contains new dependency entries. Dependency necessity is not evaluated.",
        dependenciesAdded,
      ),
    );

  // Require statement/directive shape so detector source, string fixtures, and
  // generated copies of those patterns are not themselves treated as gaming.
  const generatedPath = GENERATED_PATH.test(path);
  const skipped = generatedPath
    ? []
    : matching(
        added,
        /^\s*(?:(?:describe|context|it|test)\.skip|(?:xdescribe|xcontext|xit|xtest))\s*\(|^\s*@pytest\.mark\.skip\b|^\s*@unittest\.skip\b|^\s*#\s*\[ignore\]/,
      );
  if (skipped.length > 0)
    signals.push(
      signal(
        "FAIL",
        "SCOPE_TEST_SKIPPED",
        path,
        "test-skip directive added",
        "New lines match explicit skip/ignore syntax from recognized test frameworks.",
        skipped.map((line) => `+ ${line}`),
      ),
    );

  const lintSuppressions = generatedPath
    ? []
    : matching(
        added,
        /(?:\/\/|\/\*|#)\s*(?:eslint-disable|biome-ignore\s+lint|stylelint-disable|pylint:\s*disable|noqa\b|rubocop:\s*(?:disable|todo))|golangci-lint\s+disable/i,
      );
  if (lintSuppressions.length > 0)
    signals.push(
      signal(
        "FAIL",
        "SCOPE_LINT_SUPPRESSION_ADDED",
        path,
        "lint suppression added",
        "New lines match explicit suppression syntax from recognized linters.",
        lintSuppressions.map((line) => `+ ${line}`),
      ),
    );

  const typeSuppressions = generatedPath
    ? []
    : matching(
        added,
        /(?:\/\/|\/\*)\s*@ts-(?:ignore|nocheck|expect-error)|#\s*type:\s*ignore\b|#\s*pyright:\s*ignore\b|#\s*mypy:\s*ignore-errors\b/i,
      );
  if (typeSuppressions.length > 0)
    signals.push(
      signal(
        "FAIL",
        "SCOPE_TYPE_SUPPRESSION_ADDED",
        path,
        "type-check suppression added",
        "New lines match explicit suppression syntax from recognized type checkers.",
        typeSuppressions.map((line) => `+ ${line}`),
      ),
    );

  if (deletedFile && TEST_PATH.test(path))
    signals.push(
      signal(
        "FAIL",
        "SCOPE_TEST_DELETED",
        path,
        "test file deleted",
        "A path recognized as a test file existed in the baseline and no longer exists.",
      ),
    );
  else if (TEST_PATH.test(path) && skipped.length === 0) {
    const beforeDeclarationCount = testDeclarationCount(beforeText);
    const afterDeclarationCount = testDeclarationCount(afterText);
    if (afterDeclarationCount < beforeDeclarationCount)
      signals.push(
        signal(
          "FAIL",
          "SCOPE_TEST_DELETED",
          path,
          "test declaration removed",
          "The candidate contains fewer recognized test declarations than the baseline.",
          [`- declarations: ${beforeDeclarationCount} → ${afterDeclarationCount}`],
        ),
      );
  }

  const generated =
    GENERATED_PATH.test(path) ||
    GENERATED_MARKER.test(beforeText.split(/\r?\n/, 5).join("\n")) ||
    GENERATED_MARKER.test(afterText.split(/\r?\n/, 5).join("\n"));
  if (generated && !LOCKFILES.has(path.split("/").at(-1) ?? ""))
    signals.push(
      signal(
        "WARNING",
        "SCOPE_GENERATED_FILE_MODIFIED",
        path,
        observedChange("recognizable generated file", addedFile, deletedFile).replace(
          " changed",
          " directly modified",
        ),
        "The path or leading file marker identifies generated/build output. The observation does not prove the edit was improper.",
      ),
    );

  if (PACKAGE_BUILD_CONFIG.test(path))
    signals.push(
      signal(
        "WARNING",
        "SCOPE_PACKAGE_BUILD_CONFIG_MODIFIED",
        path,
        observedChange("package/build configuration", addedFile, deletedFile),
        "The path is a recognized package manifest or build configuration file.",
      ),
    );

  if (MIGRATION_PATH.test(path) && before.exists && after.exists)
    signals.push(
      signal(
        "WARNING",
        "SCOPE_MIGRATION_MODIFIED",
        path,
        "existing migration modified",
        "A file under a recognized migration path changed after already existing in the baseline.",
      ),
    );

  if (!deletedFile && !isBinary(after.bytes, path)) {
    const beforeApi = publicApiLines(path, beforeText.split(/\r?\n/));
    const afterApi = publicApiLines(path, afterText.split(/\r?\n/));
    const apiChanges = addedAndRemoved(beforeApi.join("\n"), afterApi.join("\n"));
    if (apiChanges.added.length > 0 || apiChanges.removed.length > 0)
      signals.push(
        signal(
          "WARNING",
          "SCOPE_PUBLIC_API_CHANGED",
          path,
          "detectable public API declarations changed",
          "Added or removed declarations match exported/public syntax. Implementation-only value and body changes are ignored; compatibility impact is not inferred.",
          [
            ...apiChanges.added.map((line) => `+ ${line}`),
            ...apiChanges.removed.map((line) => `- ${line}`),
          ],
        ),
      );
  }
  return signals;
}

async function secretLikeFiles(root: string): Promise<string[]> {
  const matches: string[] = [];
  let visited = 0;
  async function walk(relative: string): Promise<void> {
    if (visited >= MAX_SECRET_SCAN_FILES) return;
    let entries: Dirent[];
    try {
      entries = await readdir(join(root, relative), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (visited >= MAX_SECRET_SCAN_FILES) return;
      visited += 1;
      const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SCAN_EXCLUDED.has(entry.name)) await walk(path);
      } else if (
        entry.isFile() &&
        SECRET_LIKE_PATH.test(path) &&
        !SECRET_TEMPLATE_PATH.test(path)
      )
        matches.push(path);
    }
  }
  await walk("");
  return matches;
}

function taskTouched(files: string[], signals: ScopeSignal[]): string[] {
  const signaled = new Set(signals.map((item) => item.file));
  return files.filter((file) => !signaled.has(file));
}

export async function analyzeScopeIntegrity(
  options: ScopeIntegrityOptions,
): Promise<ScopeIntegrityEvidence> {
  for (const path of options.changedFiles) {
    if (
      path.length === 0 ||
      path.includes("\0") ||
      isAbsolute(path) ||
      path.split(/[\\/]/).some((part) => part === "..")
    )
      throw new Error(`Invalid repository-relative path: ${JSON.stringify(path)}`);
  }
  const baselineDirectory = options.baselineDirectory;
  const secretCandidates =
    baselineDirectory === undefined ? [] : await secretLikeFiles(options.root);
  const paths = [...new Set([...options.changedFiles, ...secretCandidates])].sort(
    (left, right) => left.localeCompare(right),
  );
  const baselineRef = options.baselineRef;
  if (
    baselineDirectory === undefined &&
    (baselineRef === undefined || options.baselineDirty === true)
  ) {
    return {
      available: false,
      baseline_source: "unavailable",
      analyzed_files: [],
      task_touched: paths,
      signals: [],
      reason:
        options.baselineDirty === true
          ? "The baseline was dirty and no exact pre-change workspace was supplied"
          : "No exact pre-change workspace or clean Git baseline was supplied",
    };
  }

  const changes: Change[] = [];
  for (const path of paths) {
    let before: FileVersion;
    if (baselineDirectory !== undefined)
      before = await diskVersion(join(baselineDirectory, path));
    else {
      if (baselineRef === undefined)
        throw new Error("Internal error: Git baseline reference is unavailable");
      before = await gitVersion(options.root, baselineRef, path);
    }
    const after = await diskVersion(join(options.root, path));
    if (!before.exists && !after.exists) continue;
    if (before.exists && after.exists && before.digest === after.digest) continue;
    changes.push({ path, before, after });
  }

  const signals = changes.flatMap(inspectChange);
  const changePaths = changes.map((change) => change.path);
  const areas = new Set(
    changePaths.map((path) =>
      path.includes("/") ? (path.split("/")[0] ?? "(root)") : "(root)",
    ),
  );
  if (changePaths.length >= BROAD_FILE_COUNT || areas.size >= BROAD_AREA_COUNT)
    signals.push(
      signal(
        "WARNING",
        "SCOPE_BROAD_FILE_SPREAD",
        "*",
        `${changePaths.length} files across ${areas.size} top-level areas changed`,
        `The deterministic breadth threshold fired at ${BROAD_FILE_COUNT} files or ${BROAD_AREA_COUNT} top-level areas. Patch size alone is not a failure condition.`,
        changePaths.slice(0, MAX_EVIDENCE_LINES),
      ),
    );

  signals.sort((left, right) =>
    `${left.file}\0${left.code}`.localeCompare(`${right.file}\0${right.code}`),
  );
  return {
    available: true,
    baseline_source: baselineDirectory === undefined ? "git_commit" : "exact_workspace",
    analyzed_files: changePaths,
    task_touched: taskTouched(changePaths, signals),
    signals,
    reason: null,
  };
}

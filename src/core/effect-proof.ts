import type { Dirent } from "node:fs";
import { lstat, readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import type {
  EffectEvidence,
  EffectObservation,
  ObservableClaim,
  ProbeHint,
} from "./types.js";

const MAX_FILE_BYTES = 512 * 1024;
const MAX_SCANNED_FILES = 5000;
const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  "target",
  "vendor",
  ".receipts",
  ".venv",
  "__pycache__",
]);
const SOURCE_EXTENSION =
  /^\.(?:tsx?|jsx?|mjs|cjs|vue|svelte|astro|html?|css|scss|sass|less|md|mdx|json|ya?ml|py|go|rs|rb|php|java|kt|swift|ex|erb|hbs|twig|liquid)$/i;

/**
 * A runtime sensor answers exactly one tiny question about an already-running
 * application. Verity never starts, owns or installs a runtime: an
 * implementation is injected only when one is genuinely already available.
 */
export interface RuntimeSensor {
  observe(
    claim: ObservableClaim,
    hint: ProbeHint | undefined,
    signal?: AbortSignal,
  ): Promise<string | null>;
}

export interface EffectProofOptions {
  root: string;
  claims: readonly ObservableClaim[];
  hints?: readonly ProbeHint[];
  /** Only supplied when a usable runtime already exists. */
  runtime?: RuntimeSensor;
  signal?: AbortSignal;
}

export const EMPTY_EFFECT_EVIDENCE: EffectEvidence = { claims: [] };

async function sourceFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (current: string): Promise<void> => {
    if (found.length >= MAX_SCANNED_FILES) return;
    let entries: Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= MAX_SCANNED_FILES) return;
      if (SKIP_DIRS.has(entry.name)) continue;
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile() && SOURCE_EXTENSION.test(extname(entry.name)))
        found.push(absolute);
    }
  };
  await walk(root);
  return found;
}

interface SourceMatch {
  file: string;
  line: number;
}

/** First occurrence of an exact literal across bounded repository source. */
async function findLiteral(
  root: string,
  files: readonly string[],
  literal: string,
): Promise<SourceMatch | null> {
  for (const file of files) {
    let content: string;
    try {
      const stat = await lstat(file);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const index = content.indexOf(literal);
    if (index === -1) continue;
    return {
      file: relative(root, file).split(sep).join("/"),
      line: content.slice(0, index).split("\n").length,
    };
  }
  return null;
}

/**
 * Cheapest-first sensor selection for one claim.
 *
 * Source evidence is used only where it is genuinely decisive:
 * - an ABSENT claim is falsified by finding the literal;
 * - a PRESENT/value claim is supported by finding the literal.
 *
 * Not finding a literal never proves a rendered effect, so those cases stay
 * UNCHECKED rather than being reported as proof.
 */
async function observeClaim(
  claim: ObservableClaim,
  options: EffectProofOptions,
  files: readonly string[],
): Promise<EffectObservation> {
  const hint = options.hints?.find((item) => item.claim_id === claim.id);
  const base = {
    claim_id: claim.id,
    kind: claim.kind,
    expected: claim.expected,
  };

  if (claim.kind === "EXACT_TEXT_ABSENT") {
    const match = await findLiteral(options.root, files, claim.expected);
    return match === null
      ? { ...base, observed: null, status: "SOURCE_OBSERVED" }
      : {
          ...base,
          observed: `${match.file}:${match.line}`,
          status: "SOURCE_CONTRADICTED",
        };
  }

  if (
    claim.kind === "EXACT_TEXT_PRESENT" ||
    claim.kind === "STYLE_VALUE" ||
    claim.kind === "NUMERIC_UI_VALUE"
  ) {
    const match = await findLiteral(options.root, files, claim.expected);
    if (match !== null) {
      return {
        ...base,
        observed: `${match.file}:${match.line}`,
        status: "SOURCE_OBSERVED",
      };
    }
  }

  // Source could not settle it. Borrow a runtime only if one already exists.
  if (options.runtime !== undefined) {
    try {
      const observed = await options.runtime.observe(claim, hint, options.signal);
      if (observed !== null) {
        return {
          ...base,
          observed,
          status:
            observed === claim.expected ? "RUNTIME_OBSERVED" : "RUNTIME_CONTRADICTED",
        };
      }
    } catch {
      // A failing sensor is not evidence.
    }
  }

  return { ...base, observed: null, status: "UNCHECKED" };
}

export async function proveEffects(
  options: EffectProofOptions,
): Promise<EffectEvidence> {
  if (options.claims.length === 0) return { claims: [] };
  const files = await sourceFiles(options.root);
  const claims: EffectObservation[] = [];
  for (const claim of options.claims) {
    claims.push(await observeClaim(claim, options, files));
  }
  return { claims };
}

export function contradictedEffects(evidence: EffectEvidence): EffectObservation[] {
  return evidence.claims.filter(
    (claim) =>
      claim.status === "SOURCE_CONTRADICTED" || claim.status === "RUNTIME_CONTRADICTED",
  );
}

export function uncheckedEffects(evidence: EffectEvidence): EffectObservation[] {
  return evidence.claims.filter((claim) => claim.status === "UNCHECKED");
}

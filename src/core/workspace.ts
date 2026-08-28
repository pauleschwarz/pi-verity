import { cp, lstat, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

export const DEFAULT_MAX_WORKSPACE_BYTES = 512 * 1024 * 1024;
const EXCLUDED = new Set([".git", ".hg", ".svn", ".receipts"]);

export interface IsolatedWorkspace {
  directory: string;
  size_bytes: number;
  cleanup: () => Promise<void>;
}

async function measuredSize(path: string, limit: number): Promise<number> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) return stat.size;
  if (!stat.isDirectory()) return stat.size;
  let total = 0;
  for (const entry of await readdir(path)) {
    if (EXCLUDED.has(entry)) continue;
    total += await measuredSize(join(path, entry), limit - total);
    if (total > limit)
      throw new Error(`Workspace exceeds disk limit of ${limit} bytes`);
  }
  return total;
}

export async function createIsolatedWorkspace(
  source: string,
  maxBytes = DEFAULT_MAX_WORKSPACE_BYTES,
  prefix = "pi-proof-",
): Promise<IsolatedWorkspace> {
  await measuredSize(source, maxBytes);
  const parent = await mkdtemp(join(tmpdir(), prefix));
  const directory = join(parent, basename(source));
  let copiedSize: number;
  try {
    await cp(source, directory, {
      recursive: true,
      dereference: false,
      filter: (path) => path === source || !EXCLUDED.has(basename(path)),
    });
    copiedSize = await measuredSize(directory, maxBytes);
  } catch (error) {
    await rm(parent, { recursive: true, force: true });
    throw error;
  }
  return {
    directory,
    size_bytes: copiedSize,
    cleanup: () => rm(parent, { recursive: true, force: true }),
  };
}

export interface CounterfactualBaseline {
  directory: string;
  repository_root: string;
  size_bytes: number;
  cleanup: () => Promise<void>;
}

export async function captureCounterfactualBaseline(
  repositoryRoot: string,
  maxBytes = DEFAULT_MAX_WORKSPACE_BYTES,
): Promise<CounterfactualBaseline> {
  const workspace = await createIsolatedWorkspace(
    repositoryRoot,
    maxBytes,
    "pi-proof-baseline-",
  );
  return { ...workspace, repository_root: repositoryRoot };
}

import { cp, lstat, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
export const DEFAULT_MAX_WORKSPACE_BYTES = 512 * 1024 * 1024;
const EXCLUDED = new Set([".git", ".hg", ".svn", ".receipts"]);
async function measuredSize(path, limit) {
    const stat = await lstat(path);
    if (stat.isSymbolicLink())
        return stat.size;
    if (!stat.isDirectory())
        return stat.size;
    let total = 0;
    for (const entry of await readdir(path)) {
        if (EXCLUDED.has(entry))
            continue;
        total += await measuredSize(join(path, entry), limit - total);
        if (total > limit)
            throw new Error(`Workspace exceeds disk limit of ${limit} bytes`);
    }
    return total;
}
export async function createIsolatedWorkspace(source, maxBytes = DEFAULT_MAX_WORKSPACE_BYTES, prefix = "pi-verity-") {
    await measuredSize(source, maxBytes);
    const parent = await mkdtemp(join(tmpdir(), prefix));
    const directory = join(parent, basename(source));
    let copiedSize;
    try {
        await cp(source, directory, {
            recursive: true,
            dereference: false,
            filter: (path) => path === source || !EXCLUDED.has(basename(path)),
        });
        copiedSize = await measuredSize(directory, maxBytes);
    }
    catch (error) {
        await rm(parent, { recursive: true, force: true });
        throw error;
    }
    return {
        directory,
        size_bytes: copiedSize,
        cleanup: () => rm(parent, { recursive: true, force: true }),
    };
}
export async function captureCounterfactualBaseline(repositoryRoot, maxBytes = DEFAULT_MAX_WORKSPACE_BYTES) {
    const workspace = await createIsolatedWorkspace(repositoryRoot, maxBytes, "pi-verity-baseline-");
    return { ...workspace, repository_root: repositoryRoot };
}
//# sourceMappingURL=workspace.js.map
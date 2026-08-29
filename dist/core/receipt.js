import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalJson } from "./hash.js";
export async function writeReceipt(path, receipt) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${canonicalJson(receipt)}\n`, {
        encoding: "utf8",
        mode: 0o600,
    });
    await rename(temporary, path);
}
//# sourceMappingURL=receipt.js.map
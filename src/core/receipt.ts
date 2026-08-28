import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalJson } from "./hash.js";
import type { ProofReceipt } from "./types.js";

export async function writeReceipt(path: string, receipt: ProofReceipt): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${canonicalJson(receipt)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, path);
}

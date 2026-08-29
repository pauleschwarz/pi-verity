import { createHash } from "node:crypto";
export function sha256(value) {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
export function canonicalJson(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(",")}]`;
    const object = value;
    return `{${Object.keys(object)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
        .join(",")}}`;
}
//# sourceMappingURL=hash.js.map
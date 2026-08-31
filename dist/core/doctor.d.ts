export declare const VERSION = "0.2.0";
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
/**
 * Read-only capability diagnostic. Performs no LLM call, no network request and
 * no repository mutation. The only filesystem write is a temporary directory in
 * the OS temp location, created to prove workspace isolation works and removed
 * immediately.
 */
export declare function runDoctor(cwd: string): Promise<DoctorReport>;
export declare function formatDoctorReport(report: DoctorReport): string;

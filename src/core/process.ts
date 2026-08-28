import { spawn } from "node:child_process";
import type { CommandResult, VerificationCommand } from "./types.js";

export interface RunOptions {
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  denyNetwork?: boolean;
  signal?: AbortSignal;
}

class BoundedCapture {
  private readonly marker = Buffer.from("\n... output truncated by pi-verity ...\n");
  private readonly headLimit: number;
  private readonly tailLimit: number;
  private head = Buffer.alloc(0);
  private tail = Buffer.alloc(0);
  private truncated = false;

  constructor(private readonly limit: number) {
    const available = Math.max(0, limit - this.marker.length);
    this.headLimit = Math.floor(available / 2);
    this.tailLimit = available - this.headLimit;
  }

  append(chunk: Buffer): void {
    if (!this.truncated) {
      const combined = Buffer.concat([this.head, chunk]);
      if (combined.length <= this.limit) {
        this.head = combined;
        return;
      }
      this.truncated = true;
      this.head = combined.subarray(0, this.headLimit);
      this.tail =
        this.tailLimit > 0 ? combined.subarray(-this.tailLimit) : Buffer.alloc(0);
      return;
    }
    if (this.tailLimit > 0)
      this.tail = Buffer.concat([this.tail, chunk]).subarray(-this.tailLimit);
  }

  value(): { text: string; truncated: boolean } {
    if (!this.truncated) return { text: this.head.toString("utf8"), truncated: false };
    const marker = this.marker.subarray(
      0,
      Math.max(0, this.limit - this.head.length - this.tail.length),
    );
    return {
      text: Buffer.concat([this.head, marker, this.tail])
        .subarray(0, this.limit)
        .toString("utf8"),
      truncated: true,
    };
  }
}

export async function runCommand(
  command: VerificationCommand,
  options: RunOptions,
): Promise<CommandResult> {
  const [program, ...programArgs] = command.command;
  if (program === undefined) throw new Error("Verification command is empty");
  const started = Date.now();
  return new Promise((resolve) => {
    let timedOut = false;
    let cancelled = options.signal?.aborted ?? false;
    let settled = false;
    const stdout = new BoundedCapture(options.maxOutputBytes);
    const stderr = new BoundedCapture(options.maxOutputBytes);

    if (cancelled) {
      resolve(result(null));
      return;
    }

    const denied = options.denyNetwork === true;
    const executable =
      denied && process.platform === "darwin" ? "/usr/bin/sandbox-exec" : program;
    const args =
      denied && process.platform === "darwin"
        ? ["-p", "(version 1)(allow default)(deny network*)", program, ...programArgs]
        : programArgs;
    const env: NodeJS.ProcessEnv = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key !== "NODE_TEST_CONTEXT"),
    );
    if (denied) {
      env.CI = "1";
      env.npm_config_offline = "true";
      env.PIP_NO_INDEX = "1";
      env.CARGO_NET_OFFLINE = "true";
      env.GOPROXY = "off";
    }
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk: Buffer) => stdout.append(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.append(chunk));

    const terminate = (): void => {
      if (child.pid === undefined) return;
      try {
        process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGTERM");
      } catch {
        /* process already exited */
      }
      setTimeout(() => {
        if (settled || child.pid === undefined) return;
        try {
          process.kill(
            process.platform === "win32" ? child.pid : -child.pid,
            "SIGKILL",
          );
        } catch {
          /* process already exited */
        }
      }, 250).unref();
    };

    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, options.timeoutMs);
    timer.unref();

    const onAbort = (): void => {
      cancelled = true;
      terminate();
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (error) => stderr.append(Buffer.from(error.message)));
    child.on("close", (code) => {
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      resolve(result(code));
    });

    function result(exitCode: number | null): CommandResult {
      const out = stdout.value();
      const err = stderr.value();
      return {
        ...command,
        cwd: options.cwd,
        exit_code: exitCode,
        duration_ms: Date.now() - started,
        stdout: out.text,
        stderr: err.text,
        stdout_truncated: out.truncated,
        stderr_truncated: err.truncated,
        timed_out: timedOut,
        cancelled,
      };
    }
  });
}

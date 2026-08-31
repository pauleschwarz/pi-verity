import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import piVerity from "../src/adapter-pi/index.js";
import type { ProofReceipt } from "../src/core/types.js";

const execFileAsync = promisify(execFile);

interface FakeContext {
  cwd: string;
  hasUI: boolean;
  sessionManager: { getSessionId: () => string };
  ui: {
    confirm: (title: string, message: string) => Promise<boolean>;
    notify: (message: string, level?: "info" | "warning" | "error") => void;
    setStatus: (key: string, value: string | undefined) => void;
    theme: {
      fg: (color: string, text: string) => string;
    };
  };
}

interface FakeEvent {
  toolName?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  text?: string;
  prompt?: string;
}

type EventHandler = (
  event: FakeEvent,
  context: FakeContext,
) => Promise<unknown> | unknown;
type CommandHandler = (args: string, context: FakeContext) => Promise<void>;
type ToolDefinition = {
  parameters: unknown;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }>;
};

function fakePi(approvals: boolean[] = []) {
  const events = new Map<string, EventHandler>();
  const commands = new Map<string, CommandHandler>();
  const tools = new Map<string, ToolDefinition>();
  const entries: Array<{
    customType: string;
    receiptPath?: string;
    verdict?: string;
    decision?: string;
    request_hash?: string;
    tool_call_id?: string;
  }> = [];
  const messages: Array<{
    content: string;
    options?: { triggerTurn?: boolean; deliverAs?: string };
  }> = [];
  const notices: string[] = [];
  const confirmations: string[] = [];
  const statuses: Array<{ key: string; value: string | undefined }> = [];
  const api = {
    on(event: string, handler: EventHandler) {
      events.set(event, handler);
    },
    appendEntry(customType: string, data?: unknown) {
      entries.push({
        customType,
        ...(data as Omit<(typeof entries)[number], "customType">),
      });
    },
    sendMessage(
      message: { content: string },
      options?: { triggerTurn?: boolean; deliverAs?: string },
    ) {
      messages.push({ content: message.content, options });
    },
    registerCommand(name: string, definition: { handler: CommandHandler }) {
      commands.set(name, definition.handler);
    },
    registerTool(tool: ToolDefinition & { name: string }) {
      tools.set(tool.name, tool);
    },
  };
  const context = (cwd: string, hasUI = true): FakeContext => ({
    cwd,
    hasUI,
    sessionManager: { getSessionId: () => "adapter-lifecycle-test" },
    ui: {
      async confirm(title, message) {
        confirmations.push(`${title}\n${message}`);
        return approvals.shift() ?? false;
      },
      notify(message) {
        notices.push(message);
      },
      setStatus(key, value) {
        statuses.push({ key, value });
      },
      theme: {
        fg(_color, text) {
          return text;
        },
      },
    },
  });
  return {
    api,
    events,
    commands,
    tools,
    entries,
    messages,
    notices,
    confirmations,
    statuses,
    context,
  };
}

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pi-verity-adapter-test-"));
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({
      name: "adapter-fixture",
      private: true,
      scripts: { test: "node value.test.mjs" },
    })}\n`,
  );
  await writeFile(join(root, "value.mjs"), "export const value = 1;\n");
  await writeFile(
    join(root, "value.test.mjs"),
    'import assert from "node:assert/strict";\nimport { value } from "./value.mjs";\nassert.equal(value, 1);\n',
  );
  await execFileAsync("git", ["init", "-q", "-b", "main"], { cwd: root });
  await execFileAsync("git", ["add", "."], { cwd: root });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.name=pi-verity test",
      "-c",
      "user.email=test@invalid",
      "commit",
      "-q",
      "-m",
      "baseline",
    ],
    { cwd: root },
  );
  return root;
}

async function cleanupReceipts(paths: Array<string | undefined>): Promise<void> {
  for (const path of paths) {
    if (path !== undefined) await rm(dirname(path), { recursive: true, force: true });
  }
}

async function withExecutionPolicy<T>(
  value: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const previous = process.env.PI_VERITY_EXECUTION_POLICY;
  if (value === undefined) delete process.env.PI_VERITY_EXECUTION_POLICY;
  else process.env.PI_VERITY_EXECUTION_POLICY = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.PI_VERITY_EXECUTION_POLICY;
    else process.env.PI_VERITY_EXECUTION_POLICY = previous;
  }
}

async function requestTool(
  fake: ReturnType<typeof fakePi>,
  event: FakeEvent,
  context: FakeContext,
  execute: () => Promise<void>,
): Promise<boolean> {
  const result = (await fake.events.get("tool_call")?.(event, context)) as
    | { block?: boolean }
    | undefined;
  if (result?.block === true) return false;
  await execute();
  return true;
}

test("turn contract is injected, checked, revalidated, and cleared", async () => {
  const root = await createFixture();
  const fake = fakePi();
  piVerity(fake.api);
  const context = fake.context(root);
  try {
    await fake.events.get("session_start")?.({}, context);
    await fake.events.get("input")?.(
      { text: 'Please add "Buy now" on /pricing' },
      context,
    );
    const injected = await fake.events.get("before_agent_start")?.({}, context);
    assert.match(JSON.stringify(injected), /claim-1.*Buy now.*must be present/);

    const tool = fake.tools.get("verity_check");
    assert.ok(tool);
    const unknown = await tool.execute("call-1", {
      hints: [{ claim_id: "unknown", file: "value.mjs" }],
    });
    assert.match(unknown.content[0]?.text ?? "", /UNCHECKED/);
    assert.ok((unknown.content[0]?.text.length ?? 1000) < 800);

    await writeFile(join(root, "value.mjs"), 'export const label = "Buy now";\n');
    await fake.events.get("tool_call")?.({ toolName: "write" }, context);
    const checked = await tool.execute("call-2", {
      hints: [{ claim_id: "claim-1", file: "value.mjs" }],
    });
    assert.match(checked.content[0]?.text ?? "", /SOURCE_OBSERVED/);
    assert.ok((checked.content[0]?.text.length ?? 1000) < 800);

    await fake.events.get("agent_settled")?.({}, context);
    const receiptPath = fake.entries.at(-1)?.receiptPath;
    assert.ok(receiptPath);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as ProofReceipt;
    assert.equal(receipt.effect_evidence.claims[0]?.status, "SOURCE_OBSERVED");

    const cleared = await tool.execute("call-3", {});
    assert.match(cleared.content[0]?.text ?? "", /no turn contract/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await cleanupReceipts(fake.entries.map((entry) => entry.receiptPath));
  }
});

test("session start clears an unfinished turn contract", async () => {
  const root = await createFixture();
  const fake = fakePi();
  piVerity(fake.api);
  const context = fake.context(root);
  try {
    await fake.events.get("input")?.({ text: 'show "Transient"' }, context);
    await fake.events.get("session_start")?.({}, context);
    const result = await fake.tools.get("verity_check")?.execute("call", {});
    assert.match(result?.content[0]?.text ?? "", /no turn contract/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("session shutdown clears an unfinished turn contract", async () => {
  const root = await createFixture();
  const fake = fakePi();
  piVerity(fake.api);
  const context = fake.context(root);
  try {
    await fake.events.get("input")?.({ text: 'keep "Shutdown claim"' }, context);
    await fake.events.get("session_shutdown")?.({}, context);
    const result = await fake.tools.get("verity_check")?.execute("call", {});
    assert.match(result?.content[0]?.text ?? "", /no turn contract/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("automatic repair keeps an exact counterfactual baseline", async () => {
  const root = await createFixture();
  const fake = fakePi();
  const previousLimit = process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS;
  const previousNetwork = process.env.PI_VERITY_ALLOW_COUNTERFACTUAL_NETWORK;
  process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS = "1";
  process.env.PI_VERITY_ALLOW_COUNTERFACTUAL_NETWORK = "1";
  piVerity(fake.api);
  const context = fake.context(root);
  try {
    await fake.events.get("session_start")?.({}, context);
    await writeFile(join(root, ".env"), "EXAMPLE_ONLY=1\n");
    await fake.events.get("tool_call")?.({ toolName: "write" }, context);
    await fake.events.get("agent_settled")?.({}, context);

    assert.equal(fake.entries.at(-1)?.verdict, "FAIL");
    assert.equal(fake.messages.length, 1);
    assert.equal(fake.messages[0]?.options?.triggerTurn, true);
    assert.equal(fake.messages[0]?.options?.deliverAs, "followUp");

    await unlink(join(root, ".env"));
    await writeFile(join(root, "value.mjs"), "export const value = 2;\n");
    await writeFile(
      join(root, "value.test.mjs"),
      'import assert from "node:assert/strict";\nimport { value } from "./value.mjs";\nassert.equal(value, 2);\n',
    );
    await fake.events.get("tool_call")?.({ toolName: "edit" }, context);
    await fake.events.get("agent_settled")?.({}, context);

    const receiptPath = fake.entries.at(-1)?.receiptPath;
    assert.ok(receiptPath);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as ProofReceipt;
    assert.equal(receipt.counterfactual?.classification, "PROVEN_REGRESSION");
    assert.equal(receipt.scope_integrity.baseline_source, "exact_workspace");
  } finally {
    if (previousLimit === undefined) {
      Reflect.deleteProperty(process.env, "PI_VERITY_MAX_REPAIR_ATTEMPTS");
    } else {
      process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS = previousLimit;
    }
    if (previousNetwork === undefined) {
      Reflect.deleteProperty(process.env, "PI_VERITY_ALLOW_COUNTERFACTUAL_NETWORK");
    } else {
      process.env.PI_VERITY_ALLOW_COUNTERFACTUAL_NETWORK = previousNetwork;
    }
    await fake.events.get("session_shutdown")?.({}, context);
    await cleanupReceipts(fake.entries.map((entry) => entry.receiptPath));
    await rm(root, { recursive: true, force: true });
  }
});

test("unset repair limit is passive by default", async () => {
  const previousLimit = process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS;
  Reflect.deleteProperty(process.env, "PI_VERITY_MAX_REPAIR_ATTEMPTS");
  const root = await createFixture();
  const fake = fakePi();
  piVerity(fake.api);
  const context = fake.context(root);
  try {
    await fake.events.get("session_start")?.({}, context);
    await writeFile(join(root, ".env"), "EXAMPLE_ONLY=1\n");
    await fake.events.get("tool_call")?.({ toolName: "write" }, context);
    await fake.events.get("agent_settled")?.({}, context);

    assert.equal(fake.entries.at(-1)?.verdict, "FAIL");
    assert.equal(fake.messages.at(-1)?.options?.triggerTurn, false);
  } finally {
    if (previousLimit === undefined) {
      Reflect.deleteProperty(process.env, "PI_VERITY_MAX_REPAIR_ATTEMPTS");
    } else {
      process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS = previousLimit;
    }
    await fake.events.get("session_shutdown")?.({}, context);
    await cleanupReceipts(fake.entries.map((entry) => entry.receiptPath));
    await rm(root, { recursive: true, force: true });
  }
});

test("PASS does not trigger repair when repair is enabled", async () => {
  const root = await createFixture();
  const fake = fakePi();
  const previousLimit = process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS;
  const previousNetwork = process.env.PI_VERITY_ALLOW_COUNTERFACTUAL_NETWORK;
  process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS = "1";
  // Linux CI has no network isolation; allow the counterfactual path so this
  // asserts repair-on-PASS behavior instead of platform INCONCLUSIVE noise.
  process.env.PI_VERITY_ALLOW_COUNTERFACTUAL_NETWORK = "1";
  piVerity(fake.api);
  const context = fake.context(root);
  try {
    await fake.events.get("session_start")?.({}, context);
    await writeFile(join(root, "value.mjs"), "export const value = 2;\n");
    await writeFile(
      join(root, "value.test.mjs"),
      'import assert from "node:assert/strict";\nimport { value } from "./value.mjs";\nassert.equal(value, 2);\n',
    );
    await fake.events.get("tool_call")?.({ toolName: "edit" }, context);
    await fake.events.get("agent_settled")?.({}, context);

    assert.equal(fake.entries.at(-1)?.verdict, "PASS");
    assert.equal(fake.messages.length, 0);
    assert.equal(fake.notices.length, 0);
    assert.match(
      fake.statuses.at(-1)?.value ?? "",
      /^pi-verity · proven · repository verified$/,
    );
  } finally {
    if (previousLimit === undefined) {
      Reflect.deleteProperty(process.env, "PI_VERITY_MAX_REPAIR_ATTEMPTS");
    } else {
      process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS = previousLimit;
    }
    if (previousNetwork === undefined) {
      Reflect.deleteProperty(process.env, "PI_VERITY_ALLOW_COUNTERFACTUAL_NETWORK");
    } else {
      process.env.PI_VERITY_ALLOW_COUNTERFACTUAL_NETWORK = previousNetwork;
    }
    await fake.events.get("session_shutdown")?.({}, context);
    await cleanupReceipts(fake.entries.map((entry) => entry.receiptPath));
    await rm(root, { recursive: true, force: true });
  }
});

test("UNPROVEN does not trigger repair when repair is enabled", async () => {
  const root = await createFixture();
  const fake = fakePi();
  const previousLimit = process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS;
  process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS = "1";
  piVerity(fake.api);
  const context = fake.context(root);
  try {
    await fake.events.get("session_start")?.({}, context);
    await writeFile(
      join(root, "package.json"),
      `${JSON.stringify({ name: "adapter-fixture", private: true })}\n`,
    );
    await fake.events.get("tool_call")?.({ toolName: "edit" }, context);
    await fake.events.get("agent_settled")?.({}, context);

    assert.equal(fake.entries.at(-1)?.verdict, "UNPROVEN");
    assert.equal(fake.messages.length, 0);
  } finally {
    if (previousLimit === undefined) {
      Reflect.deleteProperty(process.env, "PI_VERITY_MAX_REPAIR_ATTEMPTS");
    } else {
      process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS = previousLimit;
    }
    await fake.events.get("session_shutdown")?.({}, context);
    await cleanupReceipts(fake.entries.map((entry) => entry.receiptPath));
    await rm(root, { recursive: true, force: true });
  }
});

test("automatic repair stops after the configured limit", async () => {
  const root = await createFixture();
  const fake = fakePi();
  const previousLimit = process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS;
  process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS = "1";
  piVerity(fake.api);
  const context = fake.context(root);
  try {
    await fake.events.get("session_start")?.({}, context);
    for (const value of [2, 3]) {
      await writeFile(join(root, "value.mjs"), `export const value = ${value};\n`);
      await fake.events.get("tool_call")?.({ toolName: "edit" }, context);
      await fake.events.get("agent_settled")?.({}, context);
    }

    assert.equal(fake.messages.length, 2);
    assert.deepEqual(
      fake.messages.map((message) => message.options?.triggerTurn),
      [true, false],
    );
    assert.deepEqual(
      fake.messages.map((message) => message.options?.deliverAs),
      ["followUp", "nextTurn"],
    );
    assert.match(fake.messages[1]?.content ?? "", /repair limit reached \(1\)/);
  } finally {
    if (previousLimit === undefined) {
      Reflect.deleteProperty(process.env, "PI_VERITY_MAX_REPAIR_ATTEMPTS");
    } else {
      process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS = previousLimit;
    }
    await fake.events.get("session_shutdown")?.({}, context);
    await cleanupReceipts(fake.entries.map((entry) => entry.receiptPath));
    await rm(root, { recursive: true, force: true });
  }
});

test("read-only tool calls do not trigger verification", async () => {
  const root = await createFixture();
  const fake = fakePi();
  piVerity(fake.api);
  const context = fake.context(root);
  try {
    await fake.events.get("session_start")?.({}, context);
    await fake.events.get("tool_call")?.({ toolName: "read" }, context);
    await fake.events.get("agent_settled")?.({}, context);
    assert.equal(fake.entries.length, 0);
    assert.equal(fake.notices.length, 0);
  } finally {
    await fake.events.get("session_shutdown")?.({}, context);
    await rm(root, { recursive: true, force: true });
  }
});

test("mutating tool calls trigger verification", async () => {
  const root = await createFixture();
  const fake = fakePi();
  piVerity(fake.api);
  const context = fake.context(root);
  try {
    await fake.events.get("session_start")?.({}, context);
    await writeFile(join(root, "value.mjs"), "export const value = 2;\n");
    await fake.events.get("tool_call")?.({ toolName: "edit" }, context);
    await fake.events.get("agent_settled")?.({}, context);
    assert.equal(fake.entries.length, 1);
    assert.equal(fake.entries[0]?.verdict, "FAIL");
  } finally {
    await fake.events.get("session_shutdown")?.({}, context);
    await cleanupReceipts(fake.entries.map((entry) => entry.receiptPath));
    await rm(root, { recursive: true, force: true });
  }
});

test("doctor command reports local readiness", async () => {
  const root = await createFixture();
  const fake = fakePi();
  const previousLimit = process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS;
  Reflect.deleteProperty(process.env, "PI_VERITY_MAX_REPAIR_ATTEMPTS");
  piVerity(fake.api);
  const context = fake.context(root);
  try {
    await fake.commands.get("verity")?.("doctor", context);
    assert.match(fake.notices[0] ?? "", /Ready\./);
    assert.match(fake.notices[0] ?? "", /automatic repair: disabled/);
    assert.equal(fake.entries.length, 0);

    process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS = "2";
    await fake.commands.get("verity")?.("doctor", context);
    assert.match(fake.notices.at(-1) ?? "", /automatic repair: enabled \(limit 2\)/);
    assert.equal(fake.entries.length, 0);
  } finally {
    if (previousLimit === undefined) {
      Reflect.deleteProperty(process.env, "PI_VERITY_MAX_REPAIR_ATTEMPTS");
    } else {
      process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS = previousLimit;
    }
    await fake.events.get("session_shutdown")?.({}, context);
    await rm(root, { recursive: true, force: true });
  }
});

test("overlapping explicit Verity runs are coalesced", async () => {
  const root = await createFixture();
  const fake = fakePi();
  piVerity(fake.api);
  const context = fake.context(root);
  try {
    await fake.events.get("session_start")?.({}, context);
    const command = fake.commands.get("verity");
    assert.ok(command);
    assert.equal(fake.commands.has("proof"), false);
    const first = command("run", context);
    const second = command("run", context);
    await Promise.all([first, second]);

    assert.equal(fake.entries.length, 1);
    assert.ok(fake.notices.includes("pi-verity: verification already running"));
  } finally {
    await fake.events.get("session_shutdown")?.({}, context);
    await cleanupReceipts(fake.entries.map((entry) => entry.receiptPath));
    await rm(root, { recursive: true, force: true });
  }
});

test("execution policy explicit allow executes exactly once", async () => {
  await withExecutionPolicy("all", async () => {
    const fake = fakePi([true]);
    piVerity(fake.api);
    const context = fake.context(process.cwd());
    let executions = 0;
    const executed = await requestTool(
      fake,
      {
        toolName: "read",
        toolCallId: "allow-call",
        input: { path: "README.md" },
      },
      context,
      async () => {
        executions += 1;
      },
    );

    assert.equal(executed, true);
    assert.equal(executions, 1);
    assert.equal(fake.confirmations.length, 1);
    assert.equal(fake.entries[0]?.customType, "pi-verity-policy");
    assert.equal(fake.entries[0]?.decision, "ALLOW");
  });
});

test("denial survives conversation and a later exact call needs new approval", async () => {
  await withExecutionPolicy("all", async () => {
    const root = await createFixture();
    const forbidden = join(root, "forbidden.txt");
    const fake = fakePi([false, true]);
    piVerity(fake.api);
    const context = fake.context(root);
    const firstRequest: FakeEvent = {
      toolName: "bash",
      toolCallId: "touch-denied",
      input: { command: "touch forbidden.txt" },
    };
    try {
      await fake.events.get("session_start")?.({}, context);
      let executions = 0;
      const deniedExecuted = await requestTool(
        fake,
        firstRequest,
        context,
        async () => {
          executions += 1;
          await execFileAsync("touch", [forbidden]);
        },
      );
      assert.equal(deniedExecuted, false);
      assert.equal(executions, 0);
      await assert.rejects(readFile(forbidden), { code: "ENOENT" });
      assert.equal(fake.entries[0]?.decision, "DENY");
      assert.match(fake.notices[0] ?? "", /verity ⛔ BLOCKED · bash/);
      await fake.events.get("agent_settled")?.({}, context);
      assert.equal(
        fake.entries.length,
        1,
        "denied attempt must not create proof receipt",
      );

      await fake.events.get("input")?.({ text: "How do I fix this?" }, context);
      const allowedExecuted = await requestTool(
        fake,
        {
          toolName: "bash",
          toolCallId: "touch-retried",
          input: { command: "touch forbidden.txt" },
        },
        context,
        async () => {
          executions += 1;
          await execFileAsync("touch", [forbidden]);
        },
      );

      assert.equal(allowedExecuted, true);
      assert.equal(executions, 1);
      assert.equal(await readFile(forbidden, "utf8"), "");
      assert.equal(fake.confirmations.length, 2);
      assert.deepEqual(
        fake.entries.map((entry) => entry.decision),
        ["DENY", "ALLOW"],
      );
      assert.notEqual(fake.entries[0]?.request_hash, fake.entries[1]?.request_hash);
    } finally {
      await fake.events.get("session_shutdown")?.({}, context);
      await rm(root, { recursive: true, force: true });
    }
  });
});

test("changed request cannot reuse approval and later in-place mutation is blocked", async () => {
  await withExecutionPolicy("all", async () => {
    const fake = fakePi([true, true]);
    piVerity(fake.api);
    const context = fake.context(process.cwd());
    const inputA = { command: "printf A" };
    const first = await fake.events.get("tool_call")?.(
      { toolName: "bash", toolCallId: "call-a", input: inputA },
      context,
    );
    assert.equal(first, undefined);
    assert.throws(() => {
      inputA.command = "printf B";
    }, TypeError);
    assert.equal(inputA.command, "printf A");

    const second = await fake.events.get("tool_call")?.(
      {
        toolName: "bash",
        toolCallId: "call-b",
        input: { command: "printf B" },
      },
      context,
    );
    assert.equal(second, undefined);
    assert.equal(fake.confirmations.length, 2);
    assert.notEqual(fake.entries[0]?.request_hash, fake.entries[1]?.request_hash);
  });
});

test("execution policy fails closed without approval-capable UI", async () => {
  await withExecutionPolicy("all", async () => {
    const fake = fakePi();
    piVerity(fake.api);
    const context = fake.context(process.cwd(), false);
    let executions = 0;
    const executed = await requestTool(
      fake,
      {
        toolName: "read",
        toolCallId: "no-ui-call",
        input: { path: "README.md" },
      },
      context,
      async () => {
        executions += 1;
      },
    );

    assert.equal(executed, false);
    assert.equal(executions, 0);
    assert.equal(fake.confirmations.length, 0);
    assert.equal(fake.entries[0]?.decision, "BLOCK_NO_UI");
    assert.match(fake.messages[0]?.content ?? "", /approval unavailable/);
  });
});

test("policy off preserves existing tool execution without prompts or events", async () => {
  await withExecutionPolicy(undefined, async () => {
    const fake = fakePi();
    piVerity(fake.api);
    const context = fake.context(process.cwd(), false);
    let executions = 0;
    const executed = await requestTool(
      fake,
      {
        toolName: "bash",
        toolCallId: "off-call",
        input: { command: "true" },
      },
      context,
      async () => {
        executions += 1;
      },
    );

    assert.equal(executed, true);
    assert.equal(executions, 1);
    assert.equal(fake.confirmations.length, 0);
    assert.equal(fake.entries.length, 0);
  });
});

test("mutating policy gates unknown custom tools", async () => {
  await withExecutionPolicy("mutating", async () => {
    const fake = fakePi([false]);
    piVerity(fake.api);
    const context = fake.context(process.cwd());
    const readResult = await fake.events.get("tool_call")?.(
      { toolName: "read", toolCallId: "read-call", input: { path: "README.md" } },
      context,
    );
    assert.equal(readResult, undefined);
    assert.equal(fake.confirmations.length, 0);
    assert.equal(fake.entries.length, 0);

    const result = (await fake.events.get("tool_call")?.(
      {
        toolName: "custom_side_effect",
        toolCallId: "custom-call",
        input: { target: "external" },
      },
      context,
    )) as { block?: boolean } | undefined;

    assert.equal(result?.block, true);
    assert.equal(fake.confirmations.length, 1);
    assert.equal(fake.entries[0]?.decision, "DENY");
  });
});

test("policy command and doctor expose active and invalid configuration", async () => {
  await withExecutionPolicy("all", async () => {
    const root = await createFixture();
    const fake = fakePi();
    piVerity(fake.api);
    const context = fake.context(root);
    try {
      await fake.commands.get("verity")?.("policy", context);
      assert.match(fake.notices.at(-1) ?? "", /execution policy · all/);
      await fake.commands.get("verity")?.("doctor", context);
      assert.match(fake.notices.at(-1) ?? "", /execution policy: all/);
      assert.match(fake.notices.at(-1) ?? "", /non-interactive behavior: deny/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await withExecutionPolicy("invalid-value", async () => {
    const root = await createFixture();
    const fake = fakePi();
    piVerity(fake.api);
    const context = fake.context(root, false);
    try {
      await fake.commands.get("verity")?.("doctor", context);
      assert.match(fake.notices.at(-1) ?? "", /execution policy: invalid/);
      assert.match(fake.notices.at(-1) ?? "", /runtime behavior: fail-safe all/);
      const result = (await fake.events.get("tool_call")?.(
        {
          toolName: "read",
          toolCallId: "invalid-policy-call",
          input: { path: "README.md" },
        },
        context,
      )) as { block?: boolean } | undefined;
      assert.equal(result?.block, true);
      assert.equal(fake.entries[0]?.decision, "BLOCK_NO_UI");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

test("status initializes, tracks mutations, and clears only on shutdown", async () => {
  const root = await createFixture();
  const fake = fakePi();
  piVerity(fake.api);
  const context = fake.context(root);
  try {
    await fake.events.get("session_start")?.({}, context);
    assert.equal(fake.statuses.at(-1)?.key, "pi-verity");
    assert.match(fake.statuses.at(-1)?.value ?? "", /^pi-verity · observing$/);

    await fake.events.get("tool_call")?.({ toolName: "read" }, context);
    await fake.events.get("agent_settled")?.({}, context);
    assert.match(fake.statuses.at(-1)?.value ?? "", /^pi-verity · observing$/);
    assert.equal(fake.entries.length, 0);
    assert.equal(fake.notices.length, 0);

    await writeFile(join(root, "value.mjs"), "export const value = 2;\n");
    await fake.events.get("tool_call")?.({ toolName: "edit" }, context);
    assert.match(
      fake.statuses.at(-1)?.value ?? "",
      /^pi-verity · change pending · edit$/,
    );

    await fake.events.get("agent_settled")?.({}, context);
    assert.equal(fake.entries.at(-1)?.verdict, "FAIL");
    assert.match(
      fake.statuses.at(-1)?.value ?? "",
      /^pi-verity · failed · verification failed$/,
    );
    assert.ok(fake.notices.length >= 1);
    assert.match(fake.notices.at(-1) ?? "", /FAIL|failed|UNPROVEN|verity/i);

    const beforeShutdown = fake.statuses.length;
    await fake.events.get("session_shutdown")?.({}, context);
    assert.equal(fake.statuses.length, beforeShutdown + 1);
    assert.equal(fake.statuses.at(-1)?.key, "pi-verity");
    assert.equal(fake.statuses.at(-1)?.value, undefined);
  } finally {
    await cleanupReceipts(fake.entries.map((entry) => entry.receiptPath));
    await rm(root, { recursive: true, force: true });
  }
});

test("approval required is visible before confirm and recovers after allow or deny", async () => {
  await withExecutionPolicy("all", async () => {
    const allowFake = fakePi([true]);
    piVerity(allowFake.api);
    const allowContext = allowFake.context(process.cwd());
    const allowResult = await allowFake.events.get("tool_call")?.(
      {
        toolName: "bash",
        toolCallId: "approve-status",
        input: { command: "printf ok" },
      },
      allowContext,
    );
    assert.equal(allowResult, undefined);
    assert.ok(
      allowFake.statuses.some((status) =>
        /^pi-verity · approval required · bash$/.test(status.value ?? ""),
      ),
    );
    assert.match(
      allowFake.statuses.at(-1)?.value ?? "",
      /^pi-verity · change pending · bash$/,
    );

    const denyFake = fakePi([false]);
    piVerity(denyFake.api);
    const denyContext = denyFake.context(process.cwd());
    const denyResult = (await denyFake.events.get("tool_call")?.(
      {
        toolName: "bash",
        toolCallId: "deny-status",
        input: { command: "printf no" },
      },
      denyContext,
    )) as { block?: boolean } | undefined;
    assert.equal(denyResult?.block, true);
    assert.ok(
      denyFake.statuses.some((status) =>
        /^pi-verity · approval required · bash$/.test(status.value ?? ""),
      ),
    );
    assert.match(denyFake.statuses.at(-1)?.value ?? "", /^pi-verity · blocked · bash$/);
  });
});

test("explicit commands update status for missing receipt, invalid usage, and policy", async () => {
  await withExecutionPolicy("all", async () => {
    const root = await createFixture();
    const fake = fakePi();
    piVerity(fake.api);
    const context = fake.context(root);
    try {
      await fake.events.get("session_start")?.({}, context);
      await fake.commands.get("verity")?.("", context);
      assert.match(
        fake.statuses.at(-1)?.value ?? "",
        /^pi-verity · unproven · no current receipt$/,
      );

      await fake.commands.get("verity")?.("why", context);
      assert.match(
        fake.statuses.at(-1)?.value ?? "",
        /^pi-verity · unproven · no current receipt$/,
      );

      await fake.commands.get("verity")?.("receipt", context);
      assert.match(
        fake.statuses.at(-1)?.value ?? "",
        /^pi-verity · unproven · no current receipt$/,
      );

      await fake.commands.get("verity")?.("wat", context);
      assert.match(
        fake.statuses.at(-1)?.value ?? "",
        /^pi-verity · warning · invalid command$/,
      );

      await fake.commands.get("verity")?.("policy", context);
      assert.match(
        fake.statuses.at(-1)?.value ?? "",
        /^pi-verity · observing · policy$/,
      );
    } finally {
      await fake.events.get("session_shutdown")?.({}, context);
      await rm(root, { recursive: true, force: true });
    }
  });

  await withExecutionPolicy("invalid-value", async () => {
    const root = await createFixture();
    const fake = fakePi();
    piVerity(fake.api);
    const context = fake.context(root);
    try {
      await fake.commands.get("verity")?.("policy", context);
      assert.match(
        fake.statuses.at(-1)?.value ?? "",
        /^pi-verity · failed · invalid policy$/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

test("blocked status resists lower-priority overwrite until recovery", async () => {
  await withExecutionPolicy("all", async () => {
    const fake = fakePi([false]);
    piVerity(fake.api);
    const context = fake.context(process.cwd());
    const blocked = (await fake.events.get("tool_call")?.(
      {
        toolName: "bash",
        toolCallId: "block-priority",
        input: { command: "printf block" },
      },
      context,
    )) as { block?: boolean } | undefined;
    assert.equal(blocked?.block, true);
    assert.match(fake.statuses.at(-1)?.value ?? "", /^pi-verity · blocked · bash$/);

    // No mutation observed → settled must not downgrade BLOCKED to UNPROVEN/OBSERVING.
    await fake.events.get("agent_settled")?.({}, context);
    assert.match(fake.statuses.at(-1)?.value ?? "", /^pi-verity · blocked · bash$/);

    await fake.events.get("input")?.({ text: "continue" }, context);
    assert.match(fake.statuses.at(-1)?.value ?? "", /^pi-verity · observing$/);
  });
});

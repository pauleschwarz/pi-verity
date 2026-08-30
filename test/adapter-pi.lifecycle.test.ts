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
  sessionManager: { getSessionId: () => string };
  ui: {
    notify: (message: string, level?: "info" | "warning" | "error") => void;
    setStatus: (key: string, value: string | undefined) => void;
  };
}

type EventHandler = (
  event: { toolName?: string },
  context: FakeContext,
) => Promise<void> | void;
type CommandHandler = (args: string, context: FakeContext) => Promise<void>;

function fakePi() {
  const events = new Map<string, EventHandler>();
  const commands = new Map<string, CommandHandler>();
  const entries: Array<{ receiptPath: string; verdict: string }> = [];
  const messages: Array<{
    content: string;
    options?: { triggerTurn?: boolean; deliverAs?: string };
  }> = [];
  const notices: string[] = [];
  const api = {
    on(event: string, handler: EventHandler) {
      events.set(event, handler);
    },
    appendEntry(_customType: string, data?: unknown) {
      entries.push(data as { receiptPath: string; verdict: string });
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
  };
  const context = (cwd: string): FakeContext => ({
    cwd,
    sessionManager: { getSessionId: () => "adapter-lifecycle-test" },
    ui: {
      notify(message) {
        notices.push(message);
      },
      setStatus() {},
    },
  });
  return { api, events, commands, entries, messages, notices, context };
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

async function cleanupReceipts(paths: string[]): Promise<void> {
  for (const path of paths) await rm(dirname(path), { recursive: true, force: true });
}

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
  process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS = "1";
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
    assert.equal(fake.notices.length, 1);
    assert.match(fake.notices[0] ?? "", /^verity ✓ PASS · /);
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

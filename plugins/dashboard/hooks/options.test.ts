import type { CommandRunInput, On } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

// Stands in for the session: no git repo, an empty usage, and records each pane opened.
function stubSession(on: On, opened: string[]) {
  mock.clock(on);
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("command.register", (_$, e) => ({ value: { command: e.name } }));
  on("session.cwd", () => ({ value: "/tmp/plain-folder" }));
  on("session.model", () => ({ value: "claude-test" }));
  on("session.turns", () => ({ value: 0 }));
  on("session.usage", () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }));
  on("process.run", () => ({
    value: { exitCode: 128, stdout: "", stderr: "fatal: not a git repository", isStdoutTruncated: false, isStderrTruncated: false },
  }));
  on("ui.open", (_$, e) => {
    opened.push(e.id);
    return { value: { isPlaced: true } };
  });
}

const START = { cwd: "/tmp/plain-folder", surface: "terminal", isInteractive: true } as const;

test("autoOpen off: session start opens nothing, /dashboard still does", { options: { autoOpen: false } }, async ($, on) => {
  const opened: string[] = [];
  stubSession(on, opened);
  await $.session.start(START);
  expect(opened).toEqual([]);
  await $.command.run({ command: "dashboard", args: "" } as CommandRunInput);
  expect(opened).toEqual(["dashboard"]);
});

test("autoOpen on: session start opens the pane", { options: { autoOpen: true } }, async ($, on) => {
  const opened: string[] = [];
  stubSession(on, opened);
  await $.session.start(START);
  expect(opened).toEqual(["dashboard"]);
});

test("outside a git repo the pane says so", async ($, on) => {
  stubSession(on, []);
  await $.command.run({ command: "dashboard", args: "" } as CommandRunInput);
  const ui = await $.ui.mount({
    plugin: "dashboard",
    surface: "terminal",
    component: "Pane",
    requestId: "dashboard",
    props: { title: "Dashboard", isFocused: false },
  } as Parameters<typeof $.ui.mount>[0]);
  expect(await ui.findAll({ text: /not a git repo/ })).not.toHaveLength(0);
});

import type { CommandRunInput, On } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

const START = { cwd: "/tmp/project", surface: "terminal", isInteractive: true } as const;
const PANE = {
  plugin: "repo-radar",
  surface: "terminal",
  component: "Pane",
  requestId: "repo-radar",
  props: { title: "Radar", isFocused: false },
} as const;

// Stands in for the session: git answers `files` (or fails when null) and each opened pane is recorded.
function stubSession(on: On, files: string[] | null, opened: string[] = []) {
  mock.clock(on);
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("command.register", (_$, e) => ({ value: { command: e.name } }));
  on("session.repo", () => ({ value: null }));
  on("session.cwd", () => ({ value: "/tmp/project" }));
  on("process.run", () => ({
    value: files
      ? { exitCode: 0, stdout: files.join("\n"), stderr: "", isStdoutTruncated: false, isStderrTruncated: false }
      : { exitCode: 128, stdout: "", stderr: "fatal: not a git repository", isStdoutTruncated: false, isStderrTruncated: false },
  }));
  on("ui.open", (_$, e) => {
    opened.push(e.id);
    return { value: { isPlaced: true } };
  });
}

test("outside a git repo the pane says how to fix it", async ($, on) => {
  stubSession(on, null);
  await $.command.run({ command: "radar", args: "refresh" } as CommandRunInput);
  const ui = await $.ui.mount(PANE as Parameters<typeof $.ui.mount>[0]);
  expect(await ui.findAll({ text: /not a git repo/ })).not.toHaveLength(0);
});

test("depth 3 shows a third folder level", { options: { depth: 3 } }, async ($, on) => {
  stubSession(on, ["src/app/lib/a.ts", "src/app/lib/b.ts"]);
  await $.command.run({ command: "radar", args: "refresh" } as CommandRunInput);
  const ui = await $.ui.mount(PANE as Parameters<typeof $.ui.mount>[0]);
  expect(await ui.findAll({ text: /lib\// })).not.toHaveLength(0);
});

test("default depth 2 keeps the third level folded", async ($, on) => {
  stubSession(on, ["src/app/lib/a.ts", "src/app/lib/b.ts"]);
  await $.command.run({ command: "radar", args: "refresh" } as CommandRunInput);
  const ui = await $.ui.mount(PANE as Parameters<typeof $.ui.mount>[0]);
  expect(await ui.findAll({ text: /lib\// })).toHaveLength(0);
});

for (const autoOpen of [true, false]) {
  test(`autoOpen ${autoOpen} at session start`, { options: { autoOpen } }, async ($, on) => {
    const opened: string[] = [];
    stubSession(on, [], opened);
    await $.session.start(START);
    expect(opened).toEqual(autoOpen ? ["repo-radar"] : []);
  });
}

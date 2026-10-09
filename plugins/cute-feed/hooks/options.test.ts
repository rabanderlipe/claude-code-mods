import type { On } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

const START = { cwd: "/tmp/project", surface: "terminal", isInteractive: true } as const;
const PANE = {
  plugin: "cute-feed",
  surface: "terminal",
  component: "Pane",
  requestId: "cute-feed",
  props: { title: "Pet", isFocused: false },
} as const;

// Stands in for the session at start: commands, usage and each pane opened.
function stubSession(on: On, opened: string[] = []) {
  mock.clock(on);
  mock.store(on);
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("command.register", (_$, e) => ({ value: { command: e.name } }));
  on("session.usage", () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }));
  on("ui.open", (_$, e) => {
    opened.push(e.id);
    return { value: { isPlaced: true } };
  });
}

for (const autoOpen of [true, false]) {
  test(`autoOpen ${autoOpen} at session start`, { options: { autoOpen } }, async ($, on) => {
    const opened: string[] = [];
    stubSession(on, opened);
    await $.session.start(START);
    expect(opened).toEqual(autoOpen ? ["cute-feed"] : []);
  });
}

test("a brand-new pet hatches with the configured name and species", { options: { petName: "Bao", species: "penguin" } }, async ($, on) => {
  stubSession(on);
  await $.session.start(START);
  const ui = await $.ui.mount(PANE as Parameters<typeof $.ui.mount>[0]);
  expect(await ui.findAll({ text: /Bao/ })).not.toHaveLength(0);
});

test("an extra danger pattern makes the pet panic", { options: { dangerPatterns: "make\\s+nuke" } }, async ($, on) => {
  stubSession(on);
  on("tool.call", () => ({ result: "ok", text: "ok" }));
  await $.tool.call({ tool: "Bash", command: "make nuke" } as Parameters<typeof $.tool.call>[0]);
  const ui = await $.ui.mount(PANE as Parameters<typeof $.ui.mount>[0]);
  expect(await ui.findAll({ text: /careful!!/ })).not.toHaveLength(0);
});

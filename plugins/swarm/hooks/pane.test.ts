import type { AgentSpawnInput } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

const spawnOf = (
  description: string,
  parentAgentId?: string,
): AgentSpawnInput =>
  ({
    tool_use_id: `t-${description}`,
    prompt: description,
    description,
    subagentType: "Explore",
    provider: { plugin: "engine", tier: "core" },
    parentModel: "claude-opus-5-5",
    background: false,
    fork: false,
    parentAgentId,
  }) as AgentSpawnInput;

for (const surface of ["terminal", "desktop"] as const) {
  test(`two nested spawns both show on ${surface}`, async ($, on) => {
    mock.clock(on);
    let n = 0;
    on("agent.spawn", () => ({
      model: "claude-haiku-5-5",
      agentId: `ag${++n}`,
    }));
    await $.agent.spawn(spawnOf("find the user query"));
    await $.agent.spawn(spawnOf("read the adapter", "ag1"));

    const ui = await $.ui.mount({
      plugin: "swarm",
      surface,
      component: "Pane",
      requestId: "swarm",
      props: { title: "Swarm", isFocused: false },
    } as Parameters<typeof $.ui.mount>[0]);
    expect(await ui.findAll({ text: /find the user query/ })).not.toHaveLength(0);
    expect(await ui.findAll({ text: /read the adapter/ })).not.toHaveLength(0);
    expect(await ui.findAll({ text: /2 running/ })).not.toHaveLength(0);
  });
}

const spawnPlain = (description: string): AgentSpawnInput =>
  ({
    tool_use_id: `t-${description}`,
    prompt: description,
    description,
    subagentType: "Explore",
    provider: { plugin: "engine", tier: "core" },
    parentModel: "claude-test",
    background: false,
    fork: false,
  }) as AgentSpawnInput;

for (const autoOpen of [true, false]) {
  test(`autoOpen ${autoOpen}: the first spawn ${autoOpen ? "opens" : "leaves closed"} the pane`, { options: { autoOpen } }, async ($, on) => {
    mock.clock(on);
    const opened: string[] = [];
    on("ui.open", (_$, e) => {
      opened.push(e.id);
      return { value: { isPlaced: true } };
    });
    on("agent.spawn", () => ({ model: "claude-test", agentId: "a1" }));
    await $.agent.spawn(spawnPlain("look around"));
    expect(opened).toEqual(autoOpen ? ["swarm"] : []);
  });
}

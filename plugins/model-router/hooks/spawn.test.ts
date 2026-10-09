import type { AgentSpawnInput } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

const spawnOf = (subagentType: string): AgentSpawnInput =>
  ({
    tool_use_id: `t-${subagentType}`,
    prompt: "look around",
    description: "look around",
    subagentType,
    provider: { plugin: "engine", tier: "core" },
    parentModel: "claude-opus-5-5",
    background: false,
    fork: false,
  }) as AgentSpawnInput;

test("Explore subagents are sent to the light model", async ($, on) => {
  mock.store(on);
  let seen: string | undefined;
  on("agent.spawn", (_$, e) => {
    seen = e.model;
    return { model: e.model ?? "x", agentId: "a1" };
  });
  await $.agent.spawn(spawnOf("Explore"));
  expect(seen).toBe("claude-haiku-5-5");
});

test("other subagents keep their model", async ($, on) => {
  mock.store(on);
  let seen: string | undefined = "unset";
  on("agent.spawn", (_$, e) => {
    seen = e.model;
    return { model: "x", agentId: "a2" };
  });
  await $.agent.spawn(spawnOf("general-purpose"));
  expect(seen).toBe(undefined);
});

test(
  "configured light model and agent list are used",
  { options: { lightModel: "my-small", lightAgents: "scout" } },
  async ($, on) => {
    mock.store(on);
    const seen: (string | undefined)[] = [];
    on("agent.spawn", (_$, e) => {
      seen.push(e.model);
      return { model: "x", agentId: `a${seen.length}` };
    });
    await $.agent.spawn(spawnOf("scout"));
    await $.agent.spawn(spawnOf("Explore"));
    expect(seen).toEqual(["my-small", undefined]);
  },
);

test(
  "routeSubagents off leaves every spawn alone",
  { options: { routeSubagents: false } },
  async ($, on) => {
    mock.store(on);
    let seen: string | undefined = "unset";
    on("agent.spawn", (_$, e) => {
      seen = e.model;
      return { model: "x", agentId: "a3" };
    });
    await $.agent.spawn(spawnOf("Explore"));
    expect(seen).toBe(undefined);
  },
);

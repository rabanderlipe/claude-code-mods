import { expect, test } from "claude-code/testing";

import type { AgentNode } from "../types";
import { buildTree, prune } from "./tree";

const node = (id: string, extra: Partial<AgentNode> = {}): AgentNode => ({
  id,
  type: "Explore",
  label: id,
  model: "claude-haiku-5-5",
  startedAt: 0,
  tools: 0,
  status: "running",
  ...extra,
});

const lines = (rows: ReturnType<typeof buildTree>) =>
  rows.map(
    (r) =>
      `${r.prefix}${r.kind === "agent" ? r.node.id : r.kind === "group" ? `wf:${r.runId}` : `+${r.count}`}`,
  );

test("nests agents under their parentAgentId with connectors", () => {
  const rows = buildTree([node("a"), node("b", { parentId: "a" }), node("c")]);
  expect(lines(rows)).toEqual(["├─ a", "│  └─ b", "└─ c"]);
});

test("an unknown parent hangs off main", () => {
  expect(lines(buildTree([node("x", { parentId: "gone" })]))).toEqual(["└─ x"]);
});

test("workflow agents group under their run in agentIndex order", () => {
  const rows = buildTree([
    node("w2", { runId: "wf_1", agentIndex: 2 }),
    node("w1", { runId: "wf_1", agentIndex: 1 }),
  ]);
  expect(lines(rows)).toEqual(["└─ wf:wf_1", "   ├─ w1", "   └─ w2"]);
});

test("prune hides old finished agents but keeps parents of running ones", () => {
  const list = [
    node("old", { status: "done" }),
    node("parent", { status: "done" }),
    node("kid", { parentId: "parent" }),
    node("new", { status: "done" }),
  ];
  const { kept, hidden } = prune(list, 1);
  expect(kept.map((n) => n.id)).toEqual(["parent", "kid", "new"]);
  expect(hidden).toBe(1);
  expect(lines(buildTree(kept, hidden))[0]).toBe("├─ +1");
});

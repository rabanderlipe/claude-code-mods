import type { AgentNode } from "../types";

export type Row =
  | { kind: "agent"; prefix: string; node: AgentNode }
  | { kind: "group"; prefix: string; runId: string; count: number }
  | { kind: "more"; prefix: string; count: number };

export const KEEP_FINISHED = 20;

type Item =
  | { kind: "agent"; node: AgentNode }
  | { kind: "group"; runId: string; nodes: AgentNode[] };

const hasRunning = (
  node: AgentNode,
  byParent: Map<string, AgentNode[]>,
): boolean =>
  node.status === "running" ||
  (byParent.get(node.id) ?? []).some((c) => hasRunning(c, byParent));

// Drops the oldest finished agents past `keep`, never one with a running descendant.
export const prune = (nodes: readonly AgentNode[], keep = KEEP_FINISHED) => {
  const byParent = childrenOf(nodes);
  const finished = nodes.filter((n) => !hasRunning(n, byParent));
  const dropped = new Set(
    finished.slice(0, Math.max(0, finished.length - keep)).map((n) => n.id),
  );
  const kept = nodes
    .filter((n) => !dropped.has(n.id))
    // A kept agent whose parent was dropped hangs off main.
    .map((n) =>
      n.parentId && dropped.has(n.parentId) ? { ...n, parentId: undefined } : n,
    );
  return { kept, hidden: dropped.size };
};

const childrenOf = (nodes: readonly AgentNode[]) => {
  const ids = new Set(nodes.map((n) => n.id));
  const byParent = new Map<string, AgentNode[]>();
  for (const n of nodes) {
    const parent = n.parentId && ids.has(n.parentId) ? n.parentId : "main";
    byParent.set(parent, [...(byParent.get(parent) ?? []), n]);
  }
  return byParent;
};

// Workflow agents of one run sit together under a group, in agentIndex order.
const itemsOf = (children: readonly AgentNode[]): Item[] => {
  const items: Item[] = [];
  const groups = new Map<string, AgentNode[]>();
  for (const n of children) {
    if (n.runId === undefined) {
      items.push({ kind: "agent", node: n });
      continue;
    }
    const group = groups.get(n.runId);
    if (group) group.push(n);
    else {
      const fresh = [n];
      groups.set(n.runId, fresh);
      items.push({ kind: "group", runId: n.runId, nodes: fresh });
    }
  }
  for (const g of groups.values())
    g.sort((a, b) => (a.agentIndex ?? 0) - (b.agentIndex ?? 0));
  return items;
};

// The rows under main, depth first, each with its tree connectors.
export const buildTree = (nodes: readonly AgentNode[], hidden = 0): Row[] => {
  const byParent = childrenOf(nodes);
  const rows: Row[] = [];

  const walk = (parentId: string, indent: string, extra: Row | null) => {
    const items = itemsOf(byParent.get(parentId) ?? []);
    const total = items.length + (extra ? 1 : 0);
    if (extra)
      rows.push({
        ...extra,
        prefix: `${indent}${total === 1 ? "└─ " : "├─ "}`,
      });
    items.forEach((item, i) => {
      const isLast = i + (extra ? 1 : 0) === total - 1;
      const prefix = `${indent}${isLast ? "└─ " : "├─ "}`;
      const childIndent = `${indent}${isLast ? "   " : "│  "}`;
      if (item.kind === "agent") {
        rows.push({ kind: "agent", prefix, node: item.node });
        walk(item.node.id, childIndent, null);
      } else {
        rows.push({
          kind: "group",
          prefix,
          runId: item.runId,
          count: item.nodes.length,
        });
        item.nodes.forEach((n, j) => {
          const isLastInGroup = j === item.nodes.length - 1;
          rows.push({
            kind: "agent",
            prefix: `${childIndent}${isLastInGroup ? "└─ " : "├─ "}`,
            node: n,
          });
          walk(n.id, `${childIndent}${isLastInGroup ? "   " : "│  "}`, null);
        });
      }
    });
  };

  walk(
    "main",
    "",
    hidden > 0 ? { kind: "more", prefix: "", count: hidden } : null,
  );
  return rows;
};

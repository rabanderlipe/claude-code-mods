import { atom, read, update } from "claude-code";
import type { EngineInterface, Register, Timer } from "claude-code";

import type { AgentNode } from "../types";
import { buildTree, prune } from "./tree";

const PANE = "swarm";
const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const nodes = atom({ plugin: "swarm", key: "nodes" } as const, []);
const main = atom({ plugin: "swarm", key: "main" } as const, {
  model: "",
  tools: 0,
});
const frame = atom({ plugin: "swarm", key: "frame" } as const, 0);
const peak = atom({ plugin: "swarm", key: "peak" } as const, 0);

const ICONS: Record<string, string> = {
  Read: "📖",
  Edit: "✏️",
  Write: "📝",
  Bash: "💻",
  Grep: "🔍",
  Glob: "🗂️",
  Agent: "🐣",
  WebFetch: "🌐",
  WebSearch: "🔭",
  Skill: "🎓",
};

let ticker: Timer | null = null;
let isOpened = false;

const short = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

const shortModel = (model: string) => model.replace(/^claude-/, "");

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60
    ? `${s}s`
    : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
};

// What a call is doing, in a few words: icon, tool and its file, command or pattern.
const activity = (tool: string, input: Record<string, unknown>) => {
  const pick = (k: string) =>
    typeof input[k] === "string" ? (input[k] as string) : undefined;
  const path = pick("file_path") ?? pick("path");
  const subject =
    pick("command") ??
    (path ? path.split("/").slice(-2).join("/") : undefined) ??
    pick("pattern") ??
    pick("description") ??
    pick("url") ??
    "";
  const icon = ICONS[tool] ?? (tool.startsWith("mcp__") ? "🔌" : "🔧");
  return short(`${icon} ${tool} ${subject}`.trim(), 40);
};

// Runs the spinner's timer while any agent runs, and stops it when none does.
async function syncTicker($: EngineInterface): Promise<void> {
  const running = (await read($, nodes)).filter(
    (n) => n.status === "running",
  ).length;
  if (running > 0 && ticker === null) {
    ticker = $.clock.every(
      400,
      () => void update($, frame, (n) => (n + 1) % SPIN.length),
    );
  } else if (running === 0 && ticker !== null) {
    ticker.cancel();
    ticker = null;
  }
}

async function setCurrent(
  $: EngineInterface,
  agentId: string | undefined,
  current: string | undefined,
  toolDelta: number,
): Promise<void> {
  if (agentId === undefined) {
    await update($, main, (m) => ({
      ...m,
      current,
      tools: m.tools + toolDelta,
    }));
    return;
  }
  await update($, nodes, (list) =>
    list.map((n) =>
      n.id === agentId ? { ...n, current, tools: n.tools + toolDelta } : n,
    ),
  );
}

async function openPane($: EngineInterface): Promise<void> {
  isOpened = true;
  await $.ui.open({ id: PANE, title: "Swarm" });
}

export const register: Register = (on, options) => {
  const isAutoOpen = options.autoOpen !== false;
  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "swarm",
      description: "Open the live map of this session’s agents",
    });
    const model = await $.session.model();
    await update($, main, (m) => ({ ...m, model }));
    await syncTicker($);
    return next(e);
  });

  on("command.run", { command: "swarm" }, async ($) => {
    await openPane($);
    return { text: "Swarm map opened." };
  });

  on("agent.spawn", async ($, e, next) => {
    const started = await next(e);
    if (started.deny !== undefined || started.agentId === undefined)
      return started;

    const node: AgentNode = {
      id: started.agentId,
      parentId: e.parentAgentId,
      type: e.subagentType,
      label: e.name ?? e.description,
      model: started.model,
      startedAt: await $.clock.now(),
      tools: 0,
      status: "running",
      runId: e.workflow?.runId,
      agentIndex: e.workflow?.agentIndex,
      teammate: started.teammateId,
    };
    const list = await update($, nodes, (all) => [...all, node].slice(-200));
    const running = list.filter((n) => n.status === "running").length;
    await update($, peak, (p) => Math.max(p, running));
    await syncTicker($);
    if (isAutoOpen && !isOpened) void openPane($).catch(() => undefined);

    return started;
  }).catch(($, e, next) => next(e));

  on("tool.call", async ($, e, next) => {
    await setCurrent(
      $,
      e.agentId,
      activity(e.tool, e as unknown as Record<string, unknown>),
      1,
    );
    const ran = await next(e);
    await setCurrent($, e.agentId, undefined, 0);
    return ran;
  }).catch(($, e, next) => next(e));

  on("turn.complete", async ($, e, next) => {
    const id = e.agentId;
    if (id !== undefined) {
      const status = e.isAborted ? ("aborted" as const) : ("done" as const);
      await update($, nodes, (list) =>
        list.map((n) =>
          n.id === id
            ? { ...n, status, durationMs: e.durationMs, current: undefined }
            : n,
        ),
      );
      await syncTicker($);
    } else {
      await update($, main, (m) => ({ ...m, current: undefined }));
    }
    return next(e);
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e);
    const [all, m, f, p, now] = await Promise.all([
      read($, nodes),
      read($, main),
      read($, frame),
      read($, peak),
      $.clock.now(),
    ]);
    const { kept, hidden } = prune(all);
    const rows = buildTree(kept, hidden);
    const running = all.filter((n) => n.status === "running").length;
    const done = all.length - running;
    const spin = SPIN[f % SPIN.length];

    return (
      <Box flexDirection="column">
        <Text>
          <Text color="yellow">{running} running</Text> ·{" "}
          <Text color="green">{done} done</Text> · {all.length} total
          <Text dimColor> · peak {p}</Text>
        </Text>
        <Text>
          <Text bold color="cyan">
            ◆ main
          </Text>{" "}
          <Text dimColor>
            {shortModel(m.model)} · {m.tools} tools
          </Text>
          {m.current ? <Text> · {m.current}</Text> : null}
        </Text>
        {rows.map((row) => {
          if (row.kind === "more")
            return (
              <Text dimColor>
                {row.prefix}+{row.count} earlier
              </Text>
            );
          if (row.kind === "group") {
            return (
              <Text>
                <Text dimColor>{row.prefix}</Text>
                <Text color="magenta">⚙ workflow {row.runId.slice(0, 12)}</Text>
                <Text dimColor> · {row.count} agents</Text>
              </Text>
            );
          }
          const n = row.node;
          const isRunning = n.status === "running";
          const glyph = isRunning ? spin : n.status === "done" ? "✓" : "✗";
          const color = isRunning
            ? "yellow"
            : n.status === "done"
              ? "green"
              : "red";
          const elapsed = isRunning ? now - n.startedAt : (n.durationMs ?? 0);
          return (
            <Text dimColor={!isRunning}>
              <Text dimColor>{row.prefix}</Text>
              <Text color={color}>{glyph} </Text>
              {n.runId !== undefined && n.agentIndex !== undefined
                ? `#${n.agentIndex} `
                : ""}
              <Text bold={isRunning}>{n.type}</Text> "{short(n.label, 32)}"
              {n.teammate ? <Text color="cyan"> @{n.teammate}</Text> : null}
              <Text dimColor>
                {" "}
                {shortModel(n.model)} · {ago(elapsed)} · {n.tools} tools
              </Text>
              {isRunning && n.current ? <Text> · {n.current}</Text> : null}
            </Text>
          );
        })}
        {rows.length === 0 && <Text dimColor>No subagents yet.</Text>}
      </Box>
    );
  });
};

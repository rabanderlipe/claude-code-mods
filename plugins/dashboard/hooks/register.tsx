import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import type { Activity, AgentRun, Project, Usage } from "../types";

const PANE = "dashboard";

const agents = atom({ plugin: "dashboard", key: "agents" } as const, []);
const activity = atom({ plugin: "dashboard", key: "activity" } as const, []);
const project = atom({ plugin: "dashboard", key: "project" } as const, null);
const usage = atom({ plugin: "dashboard", key: "usage" } as const, null);

const git = async ($: EngineInterface, cwd: string, ...args: string[]) => {
  const ran = await $.process.run(["git", ...args], { cwd });
  return ran.exitCode === 0 ? ran.stdout.trim() : "";
};

const loadProject = async ($: EngineInterface): Promise<Project | null> => {
  const cwd = await $.session.cwd();
  const root = await git($, cwd, "rev-parse", "--show-toplevel").catch(
    () => "",
  );
  if (root === "") return null;

  const [branch, status, counts, lastCommit, worktrees] = await Promise.all([
    git($, cwd, "rev-parse", "--abbrev-ref", "HEAD"),
    git($, cwd, "status", "--porcelain"),
    git($, cwd, "rev-list", "--left-right", "--count", "@{upstream}...HEAD"),
    git($, cwd, "log", "-1", "--format=%h %s (%cr)"),
    git($, cwd, "worktree", "list", "--porcelain"),
  ]);
  const [behind, ahead] = counts.split(/\s+/).map(Number);
  const hasUpstream =
    counts !== "" && Number.isFinite(behind) && Number.isFinite(ahead);

  return {
    name: root.split("/").pop() ?? root,
    branch,
    dirty: status === "" ? 0 : status.split("\n").length,
    hasUpstream,
    ahead: hasUpstream ? (ahead ?? 0) : 0,
    behind: hasUpstream ? (behind ?? 0) : 0,
    lastCommit,
    worktrees: worktrees.split("\n").filter((l) => l.startsWith("worktree "))
      .length,
  };
};

const loadUsage = async ($: EngineInterface): Promise<Usage> => {
  const [u, model, turns, now] = await Promise.all([
    $.session.usage(),
    $.session.model(),
    $.session.turns(),
    $.clock.now(),
  ]);
  return {
    model,
    startedAt: u.startedAt,
    contextPercent: u.context.percent,
    costUsd: u.cost?.usd,
    limits: u.rateLimits.map((r) => ({
      kind: r.kind,
      percentUsed: r.percentUsed,
    })),
    turns,
    now,
  };
};

const refresh = async ($: EngineInterface) => {
  const [p, u] = await Promise.all([loadProject($), loadUsage($)]);
  await update($, project, () => p);
  await update($, usage, () => u);
};

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60
    ? `${m}m${String(s % 60).padStart(2, "0")}s`
    : `${Math.floor(m / 60)}h${m % 60}m`;
};

const bar = (percent: number, width = 20) => {
  const filled = Math.round(
    (Math.min(100, Math.max(0, percent)) / 100) * width,
  );
  return "█".repeat(filled) + "░".repeat(width - filled);
};

const shortModel = (model: string) => model.replace(/^claude-/, "");

export const register: Register = (on, options) => {
  const isAutoOpen = options.autoOpen === true;
  const refreshMs = Math.max(1, Number(options.refreshSeconds) || 5) * 1000;

  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "dashboard",
      description: "Open the agent & project dashboard pane",
    });
    void refresh($).catch(() => {});
    $.clock.every(refreshMs, () => void refresh($).catch(() => {}));
    if (isAutoOpen) void $.ui.open({ id: PANE, title: "Dashboard" }).catch(() => {});

    return next(e);
  });

  on("command.run", { command: "dashboard" }, async ($) => {
    await refresh($);
    await $.ui.open({ id: PANE, title: "Dashboard" });

    return { text: "Dashboard opened." };
  });

  on("agent.spawn", async ($, e, next) => {
    const started = await next(e);
    if (started.deny !== undefined || started.agentId === undefined)
      return started;

    const run: AgentRun = {
      id: started.agentId,
      type: e.subagentType,
      description: e.name ?? e.description,
      model: started.model,
      startedAt: await $.clock.now(),
      tools: 0,
      status: "running",
    };
    await update($, agents, (list) => [...list, run].slice(-30));

    return started;
  }).catch(($, e, next) => next(e));

  on("turn.complete", async ($, e, next) => {
    if (e.agentId !== undefined) {
      const id = e.agentId;
      await update($, agents, (list) =>
        list.map((a) =>
          a.id === id
            ? {
                ...a,
                status: e.isAborted ? ("aborted" as const) : ("done" as const),
                durationMs: e.durationMs,
              }
            : a,
        ),
      );
    } else {
      void refresh($).catch(() => {});
    }

    return next(e);
  });

  on("tool.call", async ($, e, next) => {
    const id = e.tool_use_id ?? `${e.tool}-${await $.clock.now()}`;
    const agentId = e.agentId;
    const label =
      agentId === undefined
        ? "main"
        : ((await read($, agents)).find((a) => a.id === agentId)?.type ??
          "agent");
    const item: Activity = {
      id,
      at: await $.clock.now(),
      tool: e.tool,
      agent: label,
      isDone: false,
    };

    await update($, activity, (list) => [...list, item].slice(-50));
    if (agentId !== undefined) {
      await update($, agents, (list) =>
        list.map((a) => (a.id === agentId ? { ...a, tools: a.tools + 1 } : a)),
      );
    }

    const ran = await next(e);
    await update($, activity, (list) =>
      list.map((a) => (a.id === id ? { ...a, isDone: true } : a)),
    );

    return ran;
  }).catch(($, e, next) => next(e));

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e);
    const [runs, recent, p, u] = await Promise.all([
      read($, agents),
      read($, activity),
      read($, project),
      read($, usage),
    ]);
    const now = u?.now ?? (await $.clock.now());
    const rows = e.viewport?.rows ?? 30;
    const running = runs.filter((a) => a.status === "running");
    const finished = runs.filter((a) => a.status !== "running").slice(-4);
    const room = Math.max(3, rows - 22 - running.length - finished.length);

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>
            {p ? (
              <>
                {p.name} <Text color="cyan">⎇ {p.branch}</Text>
              </>
            ) : (
              "📁 not a git repo"
            )}
          </Text>
          {p && (
            <Text dimColor>
              {p.dirty} changed ·{" "}
              {p.hasUpstream ? `↑${p.ahead} ↓${p.behind}` : "no upstream"} ·{" "}
              {p.worktrees}{" "}
              worktree{p.worktrees === 1 ? "" : "s"}
            </Text>
          )}
          {p?.lastCommit && <Text dimColor>{p.lastCommit}</Text>}
        </Box>

        {u && (
          <Box flexDirection="column">
            <Text bold>Session</Text>
            <Text>
              {shortModel(u.model)} · {u.turns} turns · up{" "}
              {ago(now - u.startedAt)}
              {u.costUsd !== undefined ? ` · $${u.costUsd.toFixed(2)}` : ""}
            </Text>
            {u.contextPercent !== undefined && (
              <Text>
                ctx{" "}
                <Text
                  color={
                    u.contextPercent > 80
                      ? "red"
                      : u.contextPercent > 60
                        ? "yellow"
                        : "green"
                  }
                >
                  {bar(u.contextPercent)}
                </Text>{" "}
                {Math.round(u.contextPercent)}%
              </Text>
            )}
            {u.limits.map((l) => (
              <Text dimColor>
                {l.kind.padEnd(8).slice(0, 8)} {bar(l.percentUsed, 12)}{" "}
                {Math.round(l.percentUsed)}%
              </Text>
            ))}
          </Box>
        )}

        <Box flexDirection="column">
          <Text bold>
            Agents <Text dimColor>({running.length} running)</Text>
          </Text>
          {runs.length === 0 && <Text dimColor>No subagents yet.</Text>}
          {running.map((a) => (
            <Text>
              <Text color="yellow">● </Text>
              {a.type} <Text dimColor>{a.description}</Text> · {a.tools} tools ·{" "}
              {ago(now - a.startedAt)}{" "}
              <Text dimColor>{shortModel(a.model)}</Text>
            </Text>
          ))}
          {finished.map((a) => (
            <Text dimColor>
              {a.status === "done" ? "✓" : "✗"} {a.type} {a.description} ·{" "}
              {a.tools} tools · {ago(a.durationMs ?? 0)}
            </Text>
          ))}
        </Box>

        <Box flexDirection="column">
          <Text bold>Activity</Text>
          {recent.length === 0 && <Text dimColor>No tool calls yet.</Text>}
          {recent.slice(-room).map((a) => (
            <Text dimColor={a.isDone}>
              {a.isDone ? " " : "›"} {a.tool} <Text dimColor>[{a.agent}]</Text>
            </Text>
          ))}
        </Box>
      </Box>
    );
  });
};

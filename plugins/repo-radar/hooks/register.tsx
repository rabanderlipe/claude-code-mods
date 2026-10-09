import { atom, read, update } from "claude-code";
import type { EngineInterface, Register, Timer } from "claude-code";

import type { TouchKind } from "../types";
import {
  MAIN,
  MAIN_COLOR,
  PALETTE,
  buildRows,
  glyph,
  hottest,
  isAnyWarm,
  relativize,
  totals,
  touch,
} from "./radar";

const PANE = "repo-radar";
const TICK_MS = 2000;

const READS = new Set(["Read", "Grep", "Glob"]);
const WRITES = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);
const KIND_COLOR: Record<TouchKind, string> = {
  read: "blue",
  write: "green",
  fail: "red",
};

const rootAtom = atom({ plugin: "repo-radar", key: "root" } as const, "");
const filesAtom = atom({ plugin: "repo-radar", key: "files" } as const, []);
const touchesAtom = atom({ plugin: "repo-radar", key: "touches" } as const, {});
const agentsAtom = atom({ plugin: "repo-radar", key: "agents" } as const, {});
const nowAtom = atom({ plugin: "repo-radar", key: "now" } as const, 0);
const isRepoAtom = atom({ plugin: "repo-radar", key: "isRepo" } as const, true);

let ticker: Timer | null = null;

async function loadRepo($: EngineInterface): Promise<number> {
  let root = "";
  try {
    root = (await $.session.repo())?.root ?? (await $.session.cwd());
  } catch {
    root = "";
  }
  let files: string[] = [];
  let isRepo = false;
  try {
    const ran = await $.process.run(["git", "ls-files"], {
      cwd: root || undefined,
    });
    isRepo = ran.exitCode === 0;
    if (isRepo) files = ran.stdout.split("\n").filter(Boolean);
  } catch {
    files = [];
  }
  await update($, rootAtom, () => root);
  await update($, filesAtom, () => files);
  await update($, isRepoAtom, () => isRepo);
  return files.length;
}

async function tick($: EngineInterface): Promise<void> {
  const now = await $.clock.now();
  await update($, nowAtom, () => now);
  if (!isAnyWarm(await read($, touchesAtom), now) && ticker) {
    ticker.cancel();
    ticker = null;
  }
}

function ensureTicker($: EngineInterface): void {
  if (ticker) return;
  ticker = $.clock.every(TICK_MS, () => void tick($));
}

async function tagAgent(
  $: EngineInterface,
  agentId: string,
  type: string,
): Promise<void> {
  await update($, agentsAtom, (agents) => {
    if (agents[agentId]) return agents;
    const n =
      Object.values(agents).filter((a) => a.name.startsWith(`${type}#`))
        .length + 1;
    const color =
      PALETTE[Object.keys(agents).length % PALETTE.length] ?? "white";
    return { ...agents, [agentId]: { name: `${type}#${n}`, color } };
  });
}

async function record(
  $: EngineInterface,
  paths: string[],
  kind: TouchKind,
  agent: string,
): Promise<void> {
  if (paths.length === 0) return;
  const now = await $.clock.now();
  await update($, touchesAtom, (touches) => {
    const next = { ...touches };
    for (const path of paths) next[path] = touch(next[path], kind, now, agent);
    return next;
  });
  await update($, nowAtom, () => now);
  ensureTicker($);
}

async function pathsOf(
  $: EngineInterface,
  input: Record<string, unknown>,
): Promise<string[]> {
  const root = await read($, rootAtom);
  return ["file_path", "notebook_path", "path"]
    .map((k) => input[k])
    .filter((v): v is string => typeof v === "string" && v !== "")
    .map((p) => relativize(root, p))
    .filter((p): p is string => p !== null);
}

export const register: Register = (on, options) => {
  const isAutoOpen = options.autoOpen === true;
  const depth = Math.max(1, Math.floor(Number(options.depth) || 2));
  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "radar",
      description:
        "Open the repo radar pane (/radar refresh re-reads the file list)",
    });
    void loadRepo($).catch(() => 0);
    if (isAutoOpen) void $.ui.open({ id: PANE, title: "Radar" }).catch(() => {});
    return next(e);
  });

  on("command.run", { command: "radar" }, async ($, e) => {
    if (e.args.trim() === "refresh") {
      const count = await loadRepo($);
      return { text: `Radar re-read ${count} files.` };
    }
    await $.ui.open({ id: PANE, title: "Radar" });
    return { text: "Radar opened." };
  });

  on("agent.spawn", async ($, e, next) => {
    const started = await next(e);
    if (started.agentId !== undefined)
      await tagAgent($, started.agentId, e.subagentType);
    return started;
  }).catch(($, e, next) => next(e));

  on("tool.call", async ($, e, next) => {
    const kind: TouchKind | null = READS.has(e.tool)
      ? "read"
      : WRITES.has(e.tool)
        ? "write"
        : null;
    if (kind === null) return next(e);

    const agent = e.agentId ?? MAIN;
    if (e.agentId !== undefined) await tagAgent($, e.agentId, "agent");
    const paths = await pathsOf($, e as unknown as Record<string, unknown>);
    await record($, paths, kind, agent);

    const ran = await next(e);
    if (ran.deny !== undefined || ran.isError === true)
      await record($, paths, "fail", agent);
    return ran;
  }).catch(($, e, next) => next(e));

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e);
    const [root, files, touches, agents, storedNow, isRepo] = await Promise.all([
      read($, rootAtom),
      read($, filesAtom),
      read($, touchesAtom),
      read($, agentsAtom),
      read($, nowAtom),
      read($, isRepoAtom),
    ]);
    const now = storedNow || (await $.clock.now());
    const rows = buildRows(files, touches, depth);
    const room = Math.max(4, (e.viewport?.rows ?? 30) - 9);
    const shown = rows.slice(0, room);
    const sum = totals(touches);
    const top = hottest(touches);
    const colorOf = (agent: string) =>
      agent === MAIN ? MAIN_COLOR : (agents[agent]?.color ?? "white");

    return (
      <Box flexDirection="column">
        <Text bold>
          📡 {root.split("/").pop() || "repo"}{" "}
          <Text dimColor>· {files.length} files</Text>
        </Text>
        {!isRepo && (
          <Text color="yellow">
            not a git repo — /radar refresh after git init
          </Text>
        )}
        {isRepo && shown.length === 0 && (
          <Text dimColor>No files yet. Try /radar refresh.</Text>
        )}
        {shown.map((row) => {
          const heat = row.heat;
          const isWarm = heat !== null && now - heat.lastAt < 60_000;
          return (
            <Text>
              {"  ".repeat(row.depth)}
              <Text color={heat ? colorOf(heat.agent) : undefined}>
                {glyph(heat?.lastAt, now)}
              </Text>{" "}
              <Text
                color={isWarm && heat ? KIND_COLOR[heat.lastKind] : undefined}
                dimColor={heat === null}
              >
                {row.name}
              </Text>
              {row.isDir && <Text dimColor> ({row.fileCount})</Text>}
              {heat && heat.reads > 0 && <Text color="blue"> r{heat.reads}</Text>}
              {heat && heat.writes > 0 && <Text color="green"> w{heat.writes}</Text>}
              {heat && heat.fails > 0 && <Text color="red"> !{heat.fails}</Text>}
            </Text>
          );
        })}
        {rows.length > shown.length && (
          <Text dimColor>… {rows.length - shown.length} more</Text>
        )}
        <Text dimColor>
          read {sum.read} · written {sum.written} · failed {sum.failed}
        </Text>
        {top.length > 0 && (
          <Text dimColor>
            🔥 {top.map((t) => t.path.split("/").pop()).join(" · ")}
          </Text>
        )}
        <Text>
          <Text color={MAIN_COLOR}>■</Text> <Text dimColor>main</Text>
          {Object.values(agents).map((a) => (
            <Text>
              {"  "}
              <Text color={a.color}>■</Text> <Text dimColor>{a.name}</Text>
            </Text>
          ))}
        </Text>
      </Box>
    );
  });
};

import type { Touch, TouchKind } from "../types";

export const HOT_MS = 10_000;
export const WARM_MS = 60_000;

export const MAIN = "main";
export const MAIN_COLOR = "cyan";
export const PALETTE = ["magenta", "yellow", "green", "blue", "red", "white"];

export type Heat = {
  reads: number;
  writes: number;
  fails: number;
  lastAt: number;
  lastKind: TouchKind;
  agent: string;
};

export type Row = {
  path: string;
  name: string;
  depth: number;
  isDir: boolean;
  fileCount: number;
  heat: Heat | null;
};

type Node = {
  name: string;
  path: string;
  isDir: boolean;
  children: Map<string, Node>;
  fileCount: number;
  heat: Heat | null;
};

// The glyph a node shows for how recently it was touched.
export const glyph = (lastAt: number | undefined, now: number) => {
  if (lastAt === undefined) return " ";
  const age = now - lastAt;
  if (age < HOT_MS) return "◉";
  if (age < WARM_MS) return "●";
  return "○";
};

export const isAnyWarm = (touches: Record<string, Touch>, now: number) =>
  Object.values(touches).some((t) => now - t.lastAt < WARM_MS);

// Records one touch on a path, counting it by kind.
export const touch = (
  prev: Touch | undefined,
  kind: TouchKind,
  at: number,
  agent: string,
): Touch => ({
  reads: (prev?.reads ?? 0) + (kind === "read" ? 1 : 0),
  writes: (prev?.writes ?? 0) + (kind === "write" ? 1 : 0),
  fails: (prev?.fails ?? 0) + (kind === "fail" ? 1 : 0),
  lastAt: at,
  lastKind: kind,
  agent,
});

// A path relative to the repo root, or null when it lies outside it.
export const relativize = (root: string, path: string) => {
  const clean = path.replace(/\/+$/, "");
  if (root === "") return clean.replace(/^\/+/, "") || null;
  if (clean === root) return null;
  if (clean.startsWith(`${root}/`)) return clean.slice(root.length + 1);
  return clean.startsWith("/") ? null : clean.replace(/^\.\//, "") || null;
};

const merge = (a: Heat | null, b: Heat | null): Heat | null => {
  if (a === null) return b;
  if (b === null) return a;
  const latest = a.lastAt >= b.lastAt ? a : b;
  return {
    reads: a.reads + b.reads,
    writes: a.writes + b.writes,
    fails: a.fails + b.fails,
    lastAt: latest.lastAt,
    lastKind: latest.lastKind,
    agent: latest.agent,
  };
};

const newNode = (name: string, path: string, isDir: boolean): Node => ({
  name,
  path,
  isDir,
  children: new Map(),
  fileCount: 0,
  heat: null,
});

const insert = (root: Node, path: string, isFile: boolean) => {
  const parts = path.split("/").filter(Boolean);
  let node = root;
  parts.forEach((part, i) => {
    const isLast = i === parts.length - 1;
    let child = node.children.get(part);
    if (!child) {
      child = newNode(
        part,
        parts.slice(0, i + 1).join("/"),
        !(isLast && isFile),
      );
      node.children.set(part, child);
    } else if (!isLast && !child.isDir) {
      child.isDir = true;
    }
    node = child;
  });
  return node;
};

const aggregate = (node: Node, touches: Record<string, Touch>): void => {
  let heat: Heat | null = touches[node.path] ?? null;
  let count = node.isDir ? 0 : 1;
  for (const child of node.children.values()) {
    aggregate(child, touches);
    heat = merge(heat, child.heat);
    count += child.fileCount;
  }
  node.heat = heat;
  node.fileCount = count;
};

const order = (a: Node, b: Node) => {
  const at = a.heat?.lastAt ?? -1;
  const bt = b.heat?.lastAt ?? -1;
  if (at !== bt) return bt - at;
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return a.name.localeCompare(b.name);
};

/**
 * The map's rows: the top `depth` levels of directories always, files only at
 * the top or when touched, and every touched path expanded down to its file.
 * Touched nodes sort first, most recent on top.
 */
export const buildRows = (
  files: readonly string[],
  touches: Record<string, Touch>,
  depth = 2,
): Row[] => {
  const root = newNode("", "", true);
  for (const file of files) insert(root, file, true);
  for (const path of Object.keys(touches)) {
    if (!files.includes(path)) insert(root, path, !hasChildrenIn(files, path));
  }
  aggregate(root, touches);

  const rows: Row[] = [];
  const walk = (node: Node, level: number) => {
    for (const child of [...node.children.values()].sort(order)) {
      const isTouched = child.heat !== null;
      const isShown = isTouched || (child.isDir ? level < depth : level === 0);
      if (!isShown) continue;
      rows.push({
        path: child.path,
        name: child.isDir ? `${child.name}/` : child.name,
        depth: level,
        isDir: child.isDir,
        fileCount: child.fileCount,
        heat: child.heat,
      });
      if (child.isDir && (isTouched || level + 1 < depth))
        walk(child, level + 1);
    }
  };
  walk(root, 0);
  return rows;
};

const hasChildrenIn = (files: readonly string[], path: string) =>
  files.some((f) => f.startsWith(`${path}/`));

export const hottest = (touches: Record<string, Touch>, n = 3) =>
  Object.entries(touches)
    .filter(([path]) => !path.endsWith("/"))
    .sort(
      ([, a], [, b]) =>
        b.reads +
          b.writes * 2 +
          b.fails * 3 -
          (a.reads + a.writes * 2 + a.fails * 3) || b.lastAt - a.lastAt,
    )
    .slice(0, n)
    .map(([path, t]) => ({ path, ...t }));

export const totals = (touches: Record<string, Touch>) => {
  const all = Object.values(touches);
  return {
    read: all.filter((t) => t.reads > 0).length,
    written: all.filter((t) => t.writes > 0).length,
    failed: all.filter((t) => t.fails > 0).length,
  };
};

import { expect, test } from "claude-code/testing";

import type { Touch } from "../types";
import { buildRows, glyph, relativize, touch } from "./radar";

const FILES = [
  "README.md",
  "apps/web/app/lib/money.ts",
  "apps/web/app/lib/money-input.ts",
  "apps/web/package.json",
  "db/seed.sql",
];

test("untouched tree collapses to two levels with file counts", () => {
  const rows = buildRows(FILES, {});
  expect(rows.map((r) => `${r.depth}:${r.name}`)).toEqual([
    "0:apps/",
    "1:web/",
    "0:db/",
    "0:README.md",
  ]);
  expect(rows.find((r) => r.name === "web/")?.fileCount).toBe(3);
});

test("a touched file expands its path and sorts first", () => {
  const touches: Record<string, Touch> = {
    "apps/web/app/lib/money.ts": touch(undefined, "write", 1000, "main"),
  };
  const rows = buildRows(FILES, touches);
  expect(rows.map((r) => r.name).slice(0, 5)).toEqual([
    "apps/",
    "web/",
    "app/",
    "lib/",
    "money.ts",
  ]);
  expect(rows.find((r) => r.name === "apps/")?.heat?.writes).toBe(1);
  expect(rows.some((r) => r.name === "money-input.ts")).toBe(false);
});

test("heat fades from hot to warm to cold", () => {
  expect(glyph(undefined, 0)).toBe(" ");
  expect(glyph(0, 5_000)).toBe("◉");
  expect(glyph(0, 30_000)).toBe("●");
  expect(glyph(0, 120_000)).toBe("○");
});

test("paths are made relative to the root", () => {
  expect(relativize("/repo", "/repo/a/b.ts")).toBe("a/b.ts");
  expect(relativize("/repo", "/elsewhere/x")).toBe(null);
  expect(relativize("", "/a/b.ts")).toBe("a/b.ts");
});

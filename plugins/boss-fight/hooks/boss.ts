import type { Boss, Suite } from "../types";

export const SUITES: readonly Suite[] = [
  "lint",
  "unit",
  "int",
  "db",
  "e2e",
  "typecheck",
];

export type FightConfig = {
  // User patterns, tried before the built-ins.
  extra: [Suite, RegExp][];
  enabled: ReadonlySet<Suite>;
};

const isSuite = (s: string): s is Suite =>
  (SUITES as readonly string[]).includes(s);

// `extraPatterns` is `suite=regex;suite=regex`; a bad suite or regex is skipped.
export const parseConfig = (
  options: Readonly<Record<string, unknown>> = {},
): FightConfig => {
  const extra: [Suite, RegExp][] = [];
  const raw =
    typeof options.extraPatterns === "string" ? options.extraPatterns : "";
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const suite = part.slice(0, eq).trim();
    const source = part.slice(eq + 1).trim();
    if (!isSuite(suite) || source === "") continue;
    try {
      extra.push([suite, new RegExp(source, "i")]);
    } catch {
      // An invalid regex is ignored rather than breaking the mod.
    }
  }

  const listed =
    typeof options.enabledSuites === "string"
      ? options.enabledSuites
      : SUITES.join(",");
  const enabled = new Set(
    listed
      .split(",")
      .map((s) => s.trim())
      .filter(isSuite),
  );

  return { extra, enabled };
};

export const DEFAULT_CONFIG: FightConfig = parseConfig();

const isWatch = (command: string) =>
  /--watch\b|:watch\b|\b(?:vitest|jest)\s+(?:watch|dev)\b/.test(command) ||
  (/(?:^|\s)-w(?:\s|$)/.test(command) &&
    !/\b(?:npm|pnpm|yarn|bun)\b/.test(command));

// A script run through a package runner or make: its name says the suite.
const SCRIPT =
  /\b(?:(?:npm|pnpm|yarn|bun)(?:\s+(?:--filter|-F|--workspace|-w|--cwd|-C)\s+\S+)*\s+(?:run\s+)?|make\s+(?:-\S+\s+)*)([\w:.\-/]+)/;

const scriptSuite = (name: string): Suite | null => {
  const n = name.toLowerCase();
  if (/e2e|playwright|cypress/.test(n)) return "e2e";
  if (/^(?:db|pgtap)[:_-]?test|test[:_-]?(?:db|pgtap|sql)$|^pgtap$/.test(n))
    return "db";
  if (
    /^test[:_-]?int(?:egration)?$|^int(?:egration)?(?:[:_-]?tests?)?$/.test(n)
  )
    return "int";
  if (/typecheck|type-check|check-types|^types$|^tsc$/.test(n))
    return "typecheck";
  if (/^lint(?:[:_-].*)?$/.test(n)) return "lint";
  if (
    /^(?:test|tests|unit|test[:_-]unit|unit[:_-]tests?|test[:_-]all)$/.test(n)
  )
    return "unit";
  return null;
};

// Tools called directly (or through npx, pnpm exec, uv run, poetry run…).
const TOOLS: [Suite, RegExp][] = [
  ["db", /\bpg_prove\b|\bsupabase\s+test\s+db\b/],
  ["e2e", /\bplaywright\s+test\b|\bcypress\s+run\b/],
  [
    "typecheck",
    /(?:^|[\s;&|(/])(?:vue-)?tsc\b|\bmypy\b|\bpyright\b|\bflow\s+check\b/,
  ],
  [
    "lint",
    /\beslint\b|\boxlint\b|\bbiome\s+(?:check|lint|ci)\b|\bruff\s+check\b|\bflake8\b|\bpylint\b|\brubocop\b|\bgolangci-lint\b|\bclippy\b/,
  ],
  [
    "unit",
    /\bvitest\b|\bjest\b|\bmocha\b|(?:^|[\s;&|(/])ava\b|\bpytest\b|\bgo\s+test\b|\bcargo\s+(?:test|nextest)\b|\brspec\b|\bphpunit\b|\bdotnet\s+test\b|\bmix\s+test\b/,
  ],
];

const INTEGRATION = /\bint(?:egration)?\b|integration|\.int\.|[/_-]int[/_.-]/i;

export const classify = (
  command: string,
  config: FightConfig = DEFAULT_CONFIG,
): Suite | null => {
  const suite = rawClassify(command, config);
  return suite !== null && config.enabled.has(suite) ? suite : null;
};

const rawClassify = (command: string, config: FightConfig): Suite | null => {
  const custom = config.extra.find(([, re]) => re.test(command));
  if (custom) return custom[0];
  if (isWatch(command)) return null;

  const script = SCRIPT.exec(command)?.[1];
  const fromScript = script ? scriptSuite(script) : null;
  if (fromScript) return fromScript;

  const tool = TOOLS.find(([, re]) => re.test(command))?.[0] ?? null;
  if (tool === "unit" && INTEGRATION.test(command)) return "int";
  return tool;
};

export const BOSSES: Record<Suite, { name: string; sprite: string }> = {
  lint: { name: "Lint Goblin", sprite: "(ง •̀_•́)ง" },
  unit: { name: "Test Slime", sprite: "(ﾉ°益°)ﾉ" },
  int: { name: "Integration Golem", sprite: "[◣_◢]" },
  db: { name: "Schema Lich", sprite: "(☠ ‿ ☠)" },
  e2e: { name: "Flaky E2E Hydra", sprite: "<°)))彡<°)))彡" },
  typecheck: { name: "Type Wraith", sprite: "(╬ಠ益ಠ)" },
};

const sum = (text: string, re: RegExp) => {
  let total = 0;
  let found = false;
  for (const m of text.matchAll(re)) {
    total += Number(m[1]);
    found = true;
  }
  return found ? total : undefined;
};

const count = (text: string, re: RegExp) => text.match(re)?.length || undefined;

type Extract = (text: string) => number | undefined;

// Tried in order; the first that finds a positive count wins.
const LINT: Extract[] = [
  (t) => sum(t, /✖\s*\d+ problems? \((\d+) errors?/g), // eslint
  (t) => sum(t, /Found \d+ warnings? and (\d+) errors?/g), // oxlint
  (t) => sum(t, /Found (\d+) errors?/g), // biome, ruff
  (t) => sum(t, /(\d+) offenses? detected/g), // rubocop
  (t) => sum(t, /due to (\d+) previous errors?/g), // clippy
  (t) => sum(t, /^(\d+) issues?:/gm), // golangci-lint
];

const TYPES: Extract[] = [
  (t) => count(t, /error TS\d+/g), // tsc, vue-tsc
  (t) => sum(t, /Found (\d+) errors?/g), // mypy, flow
  (t) => sum(t, /(\d+) errors?, \d+ warnings?/g), // pyright
];

const TESTS: Extract[] = [
  (t) => sum(t, /Tests:?\s+(\d+) failed/g), // vitest, jest
  (t) => sum(t, /\b(\d+) failing\b/g), // mocha
  (t) => sum(t, /\b(\d+) failures?\b/g), // rspec, mix
  (t) => count(t, /^--- FAIL\b/gm), // go
  (t) =>
    (sum(t, /Failures: (\d+)/g) ?? 0) + (sum(t, /Errors: (\d+)/g) ?? 0) ||
    undefined, // phpunit
  (t) => sum(t, /Failed:\s+(\d+)/g), // dotnet
  (t) => sum(t, /\b(\d+) failed\b/g), // playwright, pytest, cargo, ava
  (t) => count(t, /^\s*not ok\b/gm), // TAP
];

const DB: Extract[] = [
  (t) => count(t, /^\s*not ok\b/gm), // pg_prove, pgTAP
  (t) => sum(t, /Failed (\d+)\/\d+ subtests/g),
  ...TESTS,
];

const first = (list: Extract[], text: string) => {
  for (const f of list) {
    const n = f(text);
    if (n !== undefined && n > 0) return n;
  }
  return undefined;
};

// How many failures the run reported, when its output says; undefined when it does not.
export const failures = (suite: Suite, text: string): number | undefined => {
  switch (suite) {
    case "lint":
      return first(LINT, text);
    case "typecheck":
      return first(TYPES, text);
    case "db":
      return first(DB, text);
    default:
      return first(TESTS, text);
  }
};

export const isFailedRun = (result: { isError?: boolean; text?: string }) =>
  result.isError === true || /Exit code [1-9]\d*/.test(result.text ?? "");

const TAUNTS = [
  "ha! is that all?",
  "I grow stronger!",
  "your tests feed me",
  "try again, mortal",
];
const HITS = [
  "critical hit!",
  "a clean strike!",
  "it staggers!",
  "it shrieks!",
];

export type Outcome =
  | { kind: "none"; bosses: Boss[] }
  | { kind: "spawn" | "hit" | "heal" | "block"; bosses: Boss[]; boss: Boss }
  | { kind: "ko"; bosses: Boss[]; boss: Boss; minutes: number; hits: number };

// One run of a suite against the bosses: a failure spawns, hits or heals its boss; a pass knocks it out.
export const applyRun = (
  bosses: Boss[],
  suite: Suite,
  failed: boolean,
  count: number | undefined,
  now: number,
): Outcome => {
  const current = bosses.find((b) => b.suite === suite);
  const others = bosses.filter((b) => b.suite !== suite);

  if (!failed) {
    if (!current) return { kind: "none", bosses };
    return {
      kind: "ko",
      bosses: others,
      boss: current,
      minutes: Math.max(1, Math.round((now - current.spawnedAt) / 60000)),
      hits: current.hits + 1,
    };
  }

  if (!current) {
    const hp = count ?? 3;
    const boss: Boss = {
      suite,
      ...BOSSES[suite],
      hp,
      maxHp: hp,
      hits: 0,
      spawnedAt: now,
      last: `appears with ${hp} HP!`,
    };
    return { kind: "spawn", bosses: [...others, boss], boss };
  }

  const pick = (list: string[]) =>
    list[(current.hits + current.hp) % list.length] ?? "";
  if (count !== undefined && count < current.hp) {
    const boss = {
      ...current,
      hp: count,
      hits: current.hits + 1,
      last: `-${current.hp - count} ${pick(HITS)}`,
    };
    return { kind: "hit", bosses: [...others, boss], boss };
  }
  if (count !== undefined && count > current.hp) {
    const boss = {
      ...current,
      hp: count,
      maxHp: Math.max(current.maxHp, count),
      last: `+${count - current.hp} HP: "${pick(TAUNTS)}"`,
    };
    return { kind: "heal", bosses: [...others, boss], boss };
  }
  const boss = { ...current, last: "blocked! no damage" };
  return { kind: "block", bosses: [...others, boss], boss };
};

export const hpBar = (hp: number, maxHp: number, width = 12) => {
  const filled = maxHp <= 0 ? 0 : Math.round((Math.max(0, hp) / maxHp) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
};

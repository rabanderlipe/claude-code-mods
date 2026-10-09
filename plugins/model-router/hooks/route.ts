import type { PluginOptions } from "claude-code";

export type Tier = "light" | "standard" | "heavy";

export type Route = { tier: Tier; reason: string };

export type RouterConfig = {
  // Which model each tier runs on; `heavy` keeps the session's own model.
  models: Record<Tier, string | null>;
  // Past this many messages a model switch rewrites the whole prompt cache, which costs more than it saves.
  maxMessages: number;
  // Subagent types that only search or read: sent to the light model unless the call names one.
  lightAgents: ReadonlySet<string>;
  routeMainThread: boolean;
  routeSubagents: boolean;
};

export const DEFAULTS = {
  lightModel: "claude-haiku-5-5",
  standardModel: "claude-sonnet-5-5",
  maxMessages: 40,
  lightAgents: "Explore,claude-code-guide,statusline-setup",
  routeMainThread: true,
  routeSubagents: true,
} as const;

const str = (v: unknown, fallback: string) =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : fallback;
const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
const bool = (v: unknown, fallback: boolean) =>
  typeof v === "boolean" ? v : fallback;

export const configFrom = (
  options: PluginOptions | undefined,
): RouterConfig => {
  const o = options ?? {};
  return {
    models: {
      light: str(o.lightModel, DEFAULTS.lightModel),
      standard: str(o.standardModel, DEFAULTS.standardModel),
      heavy: null,
    },
    maxMessages: num(o.maxMessages, DEFAULTS.maxMessages),
    lightAgents: new Set(
      str(o.lightAgents, DEFAULTS.lightAgents)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
    routeMainThread: bool(o.routeMainThread, DEFAULTS.routeMainThread),
    routeSubagents: bool(o.routeSubagents, DEFAULTS.routeSubagents),
  };
};

export const describeConfig = (c: RouterConfig) =>
  [
    `light → ${c.models.light}`,
    `standard → ${c.models.standard}`,
    "heavy → session model",
    `main thread ${c.routeMainThread ? `routed (up to ${c.maxMessages} messages)` : "not routed"}`,
    `subagents ${c.routeSubagents ? `routed: ${[...c.lightAgents].join(", ") || "none"}` : "not routed"}`,
  ].join("; ");

const OVERRIDE = /^\s*!(haiku|sonnet|opus)\b/i;
const HEAVY =
  /\b(debug|bug|broken|fail|refactor|architect|design|plan|implement|migrat|security|race condition|perf|optimi[sz]|why does|root cause)/i;
const LIGHT =
  /^\s*(git (status|log|diff|pull|push)|commit|push|run (the )?(tests?|lint|format|build)|lint|format|typecheck|rename|bump|open (the )?pr|status)\b/i;
const QUESTION =
  /^\s*(what|where|which|who|when|how (do|does|can|many|much)|is|are|does|do|can|list|show|explain|summari[sz]e)\b/i;

export const route = (text: string): Route | null => {
  const forced = OVERRIDE.exec(text)?.[1]?.toLowerCase();
  if (forced === "haiku") return { tier: "light", reason: "forced" };
  if (forced === "sonnet") return { tier: "standard", reason: "forced" };
  if (forced === "opus") return { tier: "heavy", reason: "forced" };

  if (text.trimStart().startsWith("/")) return null;
  if (HEAVY.test(text)) return { tier: "heavy", reason: "complex task" };
  if (text.length <= 160 && LIGHT.test(text))
    return { tier: "light", reason: "routine command" };
  if (text.length <= 300 && QUESTION.test(text))
    return { tier: "standard", reason: "question" };

  return null;
};

export const stripOverride = (text: string) =>
  text.replace(OVERRIDE, "").trimStart();

// The model a subagent spawn is rewritten to, or undefined to leave it as called.
export const subagentModel = (
  c: RouterConfig,
  spawn: {
    subagentType: string;
    model?: string;
    fork: boolean;
    isWorkflow: boolean;
  },
): string | undefined =>
  c.routeSubagents &&
  c.lightAgents.has(spawn.subagentType) &&
  spawn.model === undefined &&
  !spawn.fork &&
  !spawn.isWorkflow
    ? (c.models.light ?? undefined)
    : undefined;

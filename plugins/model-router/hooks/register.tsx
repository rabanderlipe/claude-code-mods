import { atom, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import {
  configFrom,
  describeConfig,
  route,
  stripOverride,
  subagentModel,
} from "./route";

const last = atom({ plugin: "model-router", key: "last" } as const, null);

async function isEnabled($: EngineInterface): Promise<boolean> {
  return (await $.store.get("enabled")) !== false;
}

export const register: Register = (on, options) => {
  const config = configFrom(options);
  // The model picked for each main-thread turn, by turnId.
  const picks = new Map<string, { model: string; reason: string }>();
  let pending: { model: string; reason: string } | null = null;

  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "route",
      description:
        "Model router: /route on | off | status (prefix a prompt with !haiku, !sonnet or !opus to force)",
    });

    return next(e);
  });

  on("command.run", { command: "route" }, async ($, e) => {
    const arg = e.args.trim().toLowerCase();
    if (arg === "on" || arg === "off") {
      await $.store.set("enabled", arg === "on");
      $.ui.status(undefined);
      return { text: `Model router ${arg}.` };
    }
    return {
      text: `Model router is ${(await isEnabled($)) ? "on" : "off"}. ${describeConfig(config)}.`,
    };
  });

  on("prompt.submit", async ($, e, next) => {
    pending = null;
    if (!config.routeMainThread || !(await isEnabled($))) return next(e);

    const picked = route(e.text);
    const model = picked ? config.models[picked.tier] : null;
    if (picked && model) pending = { model, reason: picked.reason };
    $.ui.status(
      picked && model
        ? `↳ ${model.replace(/^claude-/, "")} · ${picked.reason}`
        : undefined,
    );

    const text = stripOverride(e.text);
    return next(text === e.text ? e : { ...e, text });
  }).catch(($, e, next) => next(e));

  on("turn.start", async ($, e, next) => {
    if (pending) {
      picks.set(e.turnId, pending);
      await update($, last, () => ({ ...pending!, text: e.text.slice(0, 80) }));
      pending = null;
    }
    return next(e);
  });

  on("turn.step", async function* ($, e, next) {
    const pick = e.agentId === undefined ? picks.get(e.turnId) : undefined;
    const isWorthIt =
      pick &&
      (pick.reason === "forced" || e.messageCount <= config.maxMessages);

    return yield* next(isWorthIt ? { ...e, model: pick.model } : e);
  });

  on("turn.complete", ($, e, next) => {
    if (e.agentId === undefined) picks.delete(e.turnId);
    return next(e);
  });

  on("agent.spawn", async ($, e, next) => {
    const model = subagentModel(config, {
      subagentType: e.subagentType,
      model: e.model,
      fork: e.fork,
      isWorkflow: e.workflow !== undefined,
    });
    if (model === undefined || !(await isEnabled($))) return next(e);

    return next({ ...e, model });
  }).catch(($, e, next) => next(e));
};

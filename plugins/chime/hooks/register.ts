import type { EngineInterface, PluginOptions, Register } from "claude-code";

import type { ChimeSettings } from "../types";

const DEFAULT_THRESHOLD_SEC = 45;
const DONE = "assets/done.wav";
const WAITING = "assets/waiting.wav";

// Waits the engine announces through the Notification hook that mean "Claude needs you".
const WAIT_TYPES = /permission|idle|elicitation|input/i;

// The configured defaults; `/chime` choices in the store override them per user.
type Defaults = Omit<ChimeSettings, "isOn">;

export const defaultsFrom = (options: PluginOptions | undefined): Defaults => {
  const o = options ?? {};
  const threshold = o.thresholdSeconds;
  return {
    thresholdSec:
      typeof threshold === "number" && threshold > 0
        ? threshold
        : DEFAULT_THRESHOLD_SEC,
    notify: o.notify !== false,
    waitingSound: o.waitingSound !== false,
  };
};

async function settings(
  $: EngineInterface,
  defaults: Defaults,
): Promise<ChimeSettings> {
  const isOn = (await $.store.get("isOn")) !== false;
  const raw = await $.store.get("thresholdSec");
  return {
    ...defaults,
    isOn,
    thresholdSec:
      typeof raw === "number" && raw > 0 ? raw : defaults.thresholdSec,
  };
}

async function ring(
  $: EngineInterface,
  asset: string,
  gain: number,
): Promise<void> {
  try {
    await $.audio.play({ asset }, { gain });
  } catch {
    // No player on this machine: the notification still goes out.
  }
}

export const register: Register = (on, options) => {
  const defaults = defaultsFrom(options);

  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "chime",
      description:
        "Chime: /chime on | off | test | <seconds> (long-turn threshold)",
    });
    return next(e);
  });

  on("command.run", { command: "chime" }, async ($, e) => {
    const arg = e.args.trim().toLowerCase();
    if (arg === "on" || arg === "off") {
      await $.store.set("isOn", arg === "on");
      return { text: `Chime ${arg}.` };
    }
    if (arg === "test") {
      await ring($, DONE, 1);
      await $.clock.sleep(700);
      await ring($, WAITING, 0.6);
      return { text: "🔔 done chime, then the waiting chime." };
    }
    const seconds = Number(arg);
    if (arg !== "" && Number.isFinite(seconds) && seconds > 0) {
      await $.store.set("thresholdSec", Math.round(seconds));
      return {
        text: `Chime after turns of ${Math.round(seconds)}s or longer.`,
      };
    }
    const s = await settings($, defaults);
    return {
      text: `Chime is ${s.isOn ? "on" : "off"}; rings after turns of ${s.thresholdSec}s+${s.notify ? " with a notification" : ""}${s.waitingSound ? " and when Claude waits on you" : ""}.`,
    };
  });

  on("turn.complete", async ($, e, next) => {
    if (e.agentId === undefined && !e.isAborted) {
      const s = await settings($, defaults);
      if (s.isOn && e.durationMs >= s.thresholdSec * 1000) {
        await ring($, DONE, 1);
        if (s.notify) {
          const secs = Math.round(e.durationMs / 1000);
          await $.ui.notify(`Done in ${secs}s`, { title: "Claude Code" });
        }
      }
    }
    return next(e);
  });

  on("classic.Notification", async ($, e, next) => {
    if (WAIT_TYPES.test(e.notification_type)) {
      const s = await settings($, defaults);
      if (s.isOn && s.waitingSound) await ring($, WAITING, 0.6);
    }
    return next(e);
  }).catch(($, e, next) => next(e));
};

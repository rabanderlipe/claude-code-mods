import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import { applyRun, classify, failures, hpBar, isFailedRun, parseConfig } from "./boss";
import type { FightConfig } from "./boss";

const VICTORY_MS = 10_000;

const bosses = atom({ plugin: "boss-fight", key: "bosses" } as const, []);
const victory = atom({ plugin: "boss-fight", key: "victory" } as const, null);

async function kills($: EngineInterface): Promise<number> {
  const n = await $.store.get("kills");
  return typeof n === "number" ? n : 0;
}

async function fight(
  $: EngineInterface,
  config: FightConfig,
  command: string,
  result: { isError?: boolean; text?: string },
): Promise<void> {
  const suite = classify(command, config);
  if (suite === null) return;

  const failed = isFailedRun(result);
  const count = failed ? failures(suite, result.text ?? "") : 0;
  const now = await $.clock.now();
  const outcome = applyRun(await read($, bosses), suite, failed, count, now);
  if (outcome.kind === "none") return;

  await update($, bosses, () => outcome.bosses);

  if (outcome.kind === "spawn") {
    $.ui.toast(
      `${outcome.boss.sprite} A wild ${outcome.boss.name} appears! (${outcome.boss.hp} HP)`,
    );
  } else if (outcome.kind === "ko") {
    const total = (await kills($)) + 1;
    await $.store.set("kills", total);
    const text = `⚔ defeated ${outcome.boss.name} in ${outcome.minutes}m, ${outcome.hits} hit${outcome.hits === 1 ? "" : "s"} · ${total} slain`;
    await update($, victory, () => ({ text, until: now + VICTORY_MS }));
    $.ui.toast(`🏆 ${outcome.boss.name} defeated!`);
    $.clock.after(VICTORY_MS, () => {
      void update($, victory, (v) =>
        v !== null && v.text === text ? null : v,
      );
    });
  }
}

export const register: Register = (on, options) => {
  const config = parseConfig(options);

  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "boss",
      description: "Boss fight: list active bosses and your kill count",
    });
    return next(e);
  });

  on("command.run", { command: "boss" }, async ($) => {
    const list = await read($, bosses);
    const total = await kills($);
    const lines = list.map(
      (b) =>
        `${b.sprite} ${b.name}: ${b.hp}/${b.maxHp} HP, ${b.hits} hits taken`,
    );
    return {
      text: `${lines.length ? lines.join("\n") : "No bosses. Peaceful lands."}\n🏆 ${total} slain all-time`,
    };
  });

  on("tool.call", { tool: "Bash" }, async ($, e, next) => {
    const ran = await next(e);
    if (ran.deny === undefined) await fight($, config, e.command, ran);
    return ran;
  }).catch(($, e, next) => next(e));

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const [list, won] = await Promise.all([read($, bosses), read($, victory)]);
    if (e.props.hasSurvey || (list.length === 0 && won === null))
      return next(e);

    const { Box, Text } = $.ui.resolve(e);
    const isSolo = list.length === 1;

    return (
      <Box flexDirection="column">
        {list.map((b) => (
          <Text>
            <Text color="red">{b.sprite}</Text> <Text bold>{b.name}</Text>{" "}
            <Text color="red">{hpBar(b.hp, b.maxHp)}</Text> {b.hp}/{b.maxHp}
            {!isSolo && <Text dimColor> · {b.last}</Text>}
          </Text>
        ))}
        {isSolo && list[0] && <Text dimColor> {list[0].last}</Text>}
        {won && <Text color="green">{won.text}</Text>}
      </Box>
    );
  });
};

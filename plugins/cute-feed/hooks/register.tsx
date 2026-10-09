import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import type { Effects, FeedItem, Mood, Pet, Species } from "../types";
import { describe, iconFor } from "./cat";
import {
  FEED_COOLDOWN_MS,
  LOOK_COLOR,
  SPECIES,
  adultColor,
  adultOf,
  art,
  bugKey,
  foodNow,
  isDangerous,
  parsePatterns,
  isNight,
  isSick,
  isSpecies,
  levelOf,
  linesOf,
  lookOf,
  meter,
  progressOf,
  revive,
  shouldHatch,
  stageLabel,
  stageOf,
  withFood,
} from "./pet";

const PANE = "cute-feed";
const TICK_MS = 600;
const VITALS_MS = 10_000;
const NAP_AFTER_MS = 20_000;
const CHEER_FOR_MS = 6_000;

const feed = atom({ plugin: "cute-feed", key: "feed" } as const, []);
const mood = atom({ plugin: "cute-feed", key: "mood" } as const, "sleepy");
const frame = atom({ plugin: "cute-feed", key: "frame" } as const, 0);
const stats = atom({ plugin: "cute-feed", key: "stats" } as const, { tools: 0, agents: 0, turns: 0, oops: 0 });
const petAtom = atom({ plugin: "cute-feed", key: "pet" } as const, null);
const vitals = atom({ plugin: "cute-feed", key: "vitals" } as const, {});
const effects = atom({ plugin: "cute-feed", key: "effects" } as const, {
  pattedUntil: 0,
  playUntil: 0,
  eatUntil: 0,
  sickUntil: 0,
  panicUntil: 0,
});

let lastActivity = 0;
let moodSince = 0;
let seq = 0;
let failTimes: number[] = [];
let hasWarnedContext = false;

const clockTime = (at: number) => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

async function setMood($: EngineInterface, next: Mood): Promise<void> {
  moodSince = await $.clock.now();
  lastActivity = moodSince;
  await update($, mood, () => next);
}

async function post($: EngineInterface, icon: string, text: string, id = `f${++seq}`): Promise<string> {
  const item: FeedItem = { id, at: await $.clock.now(), icon, text, isDim: false };
  await update($, feed, (list) => [...list, item].slice(-60));
  return id;
}

async function effect($: EngineInterface, key: keyof Effects, forMs: number): Promise<void> {
  const until = (await $.clock.now()) + forMs;
  await update($, effects, (fx) => ({ ...fx, [key]: until }));
}

// What the person configured: the name and species a brand-new pet starts with, and extra danger patterns.
let config: { name: string; species: Species; danger: RegExp[] } = { name: "Mochi", species: "cat", danger: [] };

// The pet, from this session's state or else the store (it outlives sessions).
async function loadPet($: EngineInterface): Promise<Pet> {
  const held = await read($, petAtom);
  if (held) return held;
  const pet = revive(await $.store.get("pet"), await $.clock.now(), config.name, config.species);
  await update($, petAtom, () => pet);
  return pet;
}

// The pet for drawing: the same lookup without writing, as a render hook must not.
async function peekPet($: EngineInterface): Promise<Pet> {
  return (await read($, petAtom)) ?? revive(await $.store.get("pet"), await $.clock.now(), config.name, config.species);
}

// Changes the pet, saves it and announces hatching, growing up and new forms.
async function changePet($: EngineInterface, change: (pet: Pet, now: number) => Pet): Promise<Pet> {
  const now = await $.clock.now();
  const before = await loadPet($);
  let after = change(before, now);

  if (shouldHatch(after)) after = { ...after, isHatched: true };
  if (stageOf(after) === "adult" && after.adult === null) after = { ...after, adult: adultOf(after.care) };

  await update($, petAtom, () => after);
  await $.store.set("pet", after);

  const [was, is] = [stageOf(before), stageOf(after)];
  if (was !== is) {
    const text =
      is === "baby"
        ? `🐣 ${after.name} hatched into a baby ${after.species}!`
        : is === "adult"
          ? `✨ ${after.name} grew up into a ${after.adult} ${after.species}!`
          : `✨ ${after.name} evolved into a ${is} ${after.species}!`;
    $.ui.toast(text);
    await post($, "✨", text.replace(/^\S+ /, ""));
    await setMood($, "happy");
  } else if (levelOf(after.xp) > levelOf(before.xp) && is !== "egg") {
    await post($, "⭐", `${after.name} reached Lv ${levelOf(after.xp)}`);
  }
  return after;
}

async function addXp($: EngineInterface, xp: number): Promise<void> {
  await changePet($, (p) => ({ ...p, xp: p.xp + xp }));
}

async function patPet($: EngineInterface): Promise<void> {
  await effect($, "pattedUntil", 3000);
  await changePet($, (p) => ({ ...p, xp: p.xp + 2, care: { ...p.care, pats: p.care.pats + 1 } }));
  await post($, "💕", "you patted me");
}

async function feedPet($: EngineInterface): Promise<string> {
  const pet = await loadPet($);
  const now = await $.clock.now();
  const wait = pet.lastFedAt + FEED_COOLDOWN_MS - now;
  if (wait > 0) {
    const text = `${pet.name} is not hungry yet (${Math.ceil(wait / 1000)}s)`;
    $.ui.toast(text);
    return text;
  }
  await effect($, "eatUntil", 2000);
  await changePet($, (p, t) => ({
    ...withFood(p, t, 25),
    lastFedAt: t,
    care: { ...p.care, feeds: p.care.feeds + 1 },
  }));
  await post($, "🍙", `you fed ${pet.name}`);
  return `${pet.name} munches happily`;
}

async function playWith($: EngineInterface): Promise<void> {
  await effect($, "playUntil", 3000);
  await changePet($, (p) => ({ ...p, xp: p.xp + 1, care: { ...p.care, plays: p.care.plays + 1 } }));
  await post($, "🎾", "we played fetch!");
}

async function setSpecies($: EngineInterface, name: string): Promise<string> {
  if (!isSpecies(name)) return `Pick one of: ${SPECIES.join(", ")}`;
  const pet = await changePet($, (p) => ({ ...p, species: name }));
  await post($, "🪄", `${pet.name} is now a ${name}`);
  return `${pet.name} is now a ${name}.`;
}

async function pollVitals($: EngineInterface): Promise<void> {
  const usage = await $.session.usage();
  const context = usage.context.percent;
  const rate = usage.rateLimits.reduce((m, r) => Math.max(m, r.percentUsed), 0);
  await update($, vitals, () => ({ context, rate }));
  if ((context ?? 0) > 90 && !hasWarnedContext) {
    hasWarnedContext = true;
    $.ui.toast("😵 context almost full!");
    await post($, "😵", "context almost full!");
  }
  if ((context ?? 0) < 80) hasWarnedContext = false;
}

async function tick($: EngineInterface): Promise<void> {
  const now = await $.clock.now();
  const current = await read($, mood);
  const isCheer = current === "happy" || current === "sad";
  if ((isCheer && now - moodSince > CHEER_FOR_MS) || (!isCheer && current !== "sleepy" && now - lastActivity > NAP_AFTER_MS)) {
    await update($, mood, () => "sleepy");
  }
  await update($, frame, (n) => (n + 1) % 1000);
}

async function onCommand($: EngineInterface, args: string): Promise<string> {
  const [verb = "", ...rest] = args.trim().split(/\s+/);
  const value = rest.join(" ").trim();
  if (verb === "name" && value) {
    await changePet($, (p) => ({ ...p, name: value.slice(0, 20) }));
    return `Your pet is now called ${value.slice(0, 20)}.`;
  }
  if (verb === "species") {
    return value ? setSpecies($, value.toLowerCase()) : `Species: ${SPECIES.join(", ")}. Use /feed species <name>.`;
  }
  if (verb === "feed") return feedPet($);
  await $.ui.open({ id: PANE, title: "Pet" });
  return "ฅ^•ﻌ•^ฅ pet opened";
}

export const register: Register = (on, options) => {
  const isAutoOpen = options.autoOpen !== false;
  const species = String(options.species ?? "cat").toLowerCase();
  config = {
    name: String(options.petName ?? "").trim().slice(0, 20) || "Mochi",
    species: isSpecies(species) ? species : "cat",
    danger: parsePatterns(String(options.dangerPatterns ?? "")),
  };

  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "feed",
      description: "Pet pane: /feed · /feed name <name> · /feed species [name] · /feed feed",
    });
    await $.command.register({ name: "pat", description: "Pat your pet ♥" });
    const pet = await loadPet($);
    await post($, "🐾", stageOf(pet) === "egg" ? "an egg! keep working to hatch it" : `${pet.name} is happy to see you`);

    $.clock.every(TICK_MS, () => void tick($).catch(() => {}));
    $.clock.every(VITALS_MS, () => void pollVitals($).catch(() => {}));
    void pollVitals($).catch(() => {});
    if (isAutoOpen) void $.ui.open({ id: PANE, title: "Pet" }).catch(() => {});

    return next(e);
  });

  on("command.run", { command: "feed" }, async ($, e) => ({ text: await onCommand($, e.args) }));

  on("command.run", { command: "pat" }, async ($) => {
    await patPet($);
    return { text: "purr~ ♥" };
  });

  on("prompt.submit", async ($, e, next) => {
    if (!e.text.trimStart().startsWith("/")) {
      await setMood($, "thinking");
      await post($, "💬", `you: ${e.text.replace(/\s+/g, " ").slice(0, 44)}`);
    }
    return next(e);
  }).catch(($, e, next) => next(e));

  on("tool.call", async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>;
    const now = await $.clock.now();
    const id = await post($, iconFor(e.tool), `${e.agentId === undefined ? "" : "🐣 "}${describe(e.tool, input)}`);
    await setMood($, "working");
    await update($, stats, (s) => ({ ...s, tools: s.tools + 1 }));

    const command = typeof input.command === "string" ? input.command : "";
    if (e.tool === "Bash" && isDangerous(command, config.danger)) {
      await effect($, "panicUntil", 8000);
      await post($, "🚨", `careful!! ${command.slice(0, 40)}`);
    }

    await changePet($, (p) => ({
      ...p,
      xp: p.xp + 1,
      care: {
        ...p.care,
        acts: p.care.acts + 1,
        night: p.care.night + (isNight(new Date(now).getHours()) ? 1 : 0),
        reads: p.care.reads + (e.tool === "Read" ? 1 : 0),
        searches: p.care.searches + (["Grep", "Glob", "WebSearch", "WebFetch"].includes(e.tool) ? 1 : 0),
        bash: p.care.bash + (e.tool === "Bash" ? 1 : 0),
        edits: p.care.edits + (["Edit", "Write", "NotebookEdit"].includes(e.tool) ? 1 : 0),
      },
    }));

    const ran = await next(e);
    const isOops = ran.deny !== undefined || ran.isError === true;
    const key = bugKey(e.tool, input);
    await update($, feed, (list) => list.map((f) => (f.id === id ? { ...f, isDim: true, icon: isOops ? "💥" : f.icon } : f)));

    if (isOops) {
      const at = await $.clock.now();
      failTimes = [...failTimes.filter((t) => at - t < 60_000), at];
      await update($, stats, (s) => ({ ...s, oops: s.oops + 1 }));
      await changePet($, (p) => ({
        ...p,
        bugs: [...p.bugs, { key, at }].slice(-30),
        care: { ...p.care, fails: p.care.fails + 1 },
      }));
      if (isSick(failTimes, at)) {
        await effect($, "sickUntil", 30_000);
        await post($, "🤢", "too many bugs… feeling sick");
      } else {
        await setMood($, "sad");
      }
      return ran;
    }

    const pet = await loadPet($);
    const squashed = pet.bugs.filter((b) => b.key === key).length;
    const lines = linesOf(e.tool, input);
    if (squashed > 0 || lines > 0) {
      if (lines > 0) await effect($, "eatUntil", 1500);
      await changePet($, (p, t) => ({
        ...(lines > 0 ? withFood(p, t, Math.min(30, Math.ceil(lines / 4))) : p),
        bugs: p.bugs.filter((b) => b.key !== key),
        care: { ...p.care, bugsCleaned: p.care.bugsCleaned + squashed, linesEaten: p.care.linesEaten + lines },
      }));
      if (squashed > 0) await post($, "🧹", `cleaned up ${squashed} bug${squashed === 1 ? "" : "s"}`);
    }

    return ran;
  }).catch(($, e, next) => next(e));

  on("agent.spawn", async ($, e, next) => {
    const started = await next(e);
    if (started.agentId !== undefined) {
      await post($, "🥚", `hatched ${e.subagentType}: ${e.description.slice(0, 32)}`);
      await update($, stats, (s) => ({ ...s, agents: s.agents + 1 }));
      await changePet($, (p) => ({ ...p, care: { ...p.care, agents: p.care.agents + 1 } }));
    }
    return started;
  }).catch(($, e, next) => next(e));

  on("turn.complete", async ($, e, next) => {
    const secs = Math.round(e.durationMs / 1000);
    if (e.agentId !== undefined) {
      await post($, "🐥", `a helper finished in ${secs}s`);
      await addXp($, 25);
      return next(e);
    }
    await update($, stats, (s) => ({ ...s, turns: s.turns + 1 }));
    if (e.isAborted) {
      await post($, "✋", "stopped");
      await setMood($, "sad");
    } else {
      await post($, "🎉", `done in ${secs}s`);
      await setMood($, "happy");
    }
    await changePet($, (p) => ({ ...p, xp: p.xp + (e.isAborted ? 0 : 10), turns: p.turns + 1 }));
    return next(e);
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e);
    const { Box, Text, Button } = els;
    const Select = "Select" in els ? els.Select : undefined;
    const [items, m, f, s, fx, v, pet, now] = await Promise.all([
      read($, feed),
      read($, mood),
      read($, frame),
      read($, stats),
      read($, effects),
      read($, vitals),
      peekPet($),
      $.clock.now(),
    ]);
    const food = foodNow(pet, now);
    const look = lookOf(m, fx, v, food, now);
    const lines = art(pet, look, f, now);
    const color = (look === m && adultColor(pet.adult)) || LOOK_COLOR[look];
    const isEgg = stageOf(pet) === "egg";
    const c = pet.care;
    const nightShare = c.acts === 0 ? 0 : Math.round((c.night / c.acts) * 100);
    const room = Math.max(3, (e.viewport?.rows ?? 30) - lines.length - 11);

    return (
      <Box flexDirection="column">
        <Box flexDirection="column">
          {lines.map((line) => (
            <Text color={color}>{line}</Text>
          ))}
        </Box>
        <Text bold>
          {pet.name} <Text dimColor>· {stageLabel(pet)}</Text>
        </Text>
        {!isEgg && (
          <Text dimColor>
            xp {meter(progressOf(pet.xp) * 100)} {pet.xp}
            {stageOf(pet) !== "adult" && stageOf(pet) !== "baby" ? ` · growing into ${adultOf(c)}` : ""}
          </Text>
        )}
        <Text>
          🍙 <Text color={food < 15 ? "red" : "green"}>{meter(food, 8)}</Text> {Math.round(food)}
          {"  "}🧠 <Text color={(v.context ?? 0) > 70 ? "yellow" : "cyan"}>{meter(v.context ?? 0, 8)}</Text>{" "}
          {Math.round(v.context ?? 0)}%{(v.rate ?? 0) > 0 ? `  ⏱ ${Math.round(v.rate ?? 0)}%` : ""}
          {pet.bugs.length > 0 ? `  🐛×${pet.bugs.length}` : ""}
        </Text>
        <Text dimColor>
          ✏️ {c.linesEaten} lines · 📖 {c.reads + c.searches} · 💻 {c.bash} · 🐣 {c.agents} · 💥 {c.fails} · 🧹{" "}
          {c.bugsCleaned} · 🌙 {nightShare}%
        </Text>
        <Box flexDirection="row" gap={1} marginBottom={1}>
          <Button key="pat" label="Pat ♥" onPress={() => void patPet($)} />
          <Button key="feed" label="Feed 🍙" onPress={() => void feedPet($)} />
          <Button key="play" label="Play 🎾" onPress={() => void playWith($)} />
          {Select && (
            <Select
              key="species"
              label="Species"
              value={pet.species}
              options={SPECIES.map((sp) => ({ value: sp, label: sp }))}
              onSelect={(value) => void setSpecies($, value)}
            />
          )}
        </Box>
        <Text dimColor>
          🔧 {s.tools} · 🐣 {s.agents} · 🎉 {s.turns} · 💥 {s.oops}
        </Text>
        {items.slice(-room).map((item, i, shown) => (
          <Text dimColor={item.isDim && i < shown.length - 1}>
            <Text dimColor>{clockTime(item.at)} </Text>
            {item.icon} {item.text}
          </Text>
        ))}
      </Box>
    );
  });
};

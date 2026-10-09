import { expect, test } from "claude-code/testing";

import type { Care } from "../types";
import {
  FOOD_DECAY_MS,
  adultOf,
  art,
  bugKey,
  foodNow,
  isDangerous,
  isSick,
  levelOf,
  linesOf,
  lookOf,
  newPet,
  parsePatterns,
  progressOf,
  revive,
  shouldHatch,
  stageOf,
  xpForLevel,
} from "./pet";

const care = (over: Partial<Care>): Care => ({ ...newPet(0).care, ...over });
const calm = { pattedUntil: 0, playUntil: 0, eatUntil: 0, sickUntil: 0, panicUntil: 0 };

test("levels follow a gentle curve", () => {
  expect(levelOf(0)).toBe(1);
  expect(levelOf(20)).toBe(2);
  expect(levelOf(79)).toBe(2);
  expect(levelOf(xpForLevel(7))).toBe(7);
  expect(progressOf(50)).toBeGreaterThan(0);
  expect(progressOf(50)).toBeLessThan(1);
});

test("an egg hatches after three finished turns, then grows by level", () => {
  const egg = newPet(0);
  expect(stageOf(egg)).toBe("egg");
  expect(shouldHatch({ ...egg, turns: 2 })).toBe(false);
  expect(shouldHatch({ ...egg, turns: 3 })).toBe(true);
  const born = { ...egg, isHatched: true };
  expect(stageOf(born)).toBe("baby");
  expect(stageOf({ ...born, xp: xpForLevel(3) })).toBe("kid");
  expect(stageOf({ ...born, xp: xpForLevel(5) })).toBe("teen");
  expect(stageOf({ ...born, xp: xpForLevel(7) })).toBe("adult");
});

test("the adult form follows how it was raised", () => {
  expect(adultOf(care({ acts: 100, night: 60 }))).toBe("Owl");
  expect(adultOf(care({ acts: 100, fails: 20 }))).toBe("Gremlin");
  expect(adultOf(care({ acts: 100, feeds: 10, fails: 1 }))).toBe("Golden");
  expect(adultOf(care({ acts: 100, agents: 12, fails: 10 }))).toBe("Shepherd");
  expect(adultOf(care({ acts: 100, edits: 40, fails: 10 }))).toBe("Chonk");
  expect(adultOf(care({ acts: 100, reads: 30, searches: 25, fails: 10 }))).toBe("Scholar");
  expect(adultOf(care({ acts: 100, bash: 45, fails: 10 }))).toBe("Hacker");
  expect(adultOf(care({ acts: 100, fails: 10 }))).toBe("Classic");
});

test("three failures in a minute make it sick; spread out they do not", () => {
  expect(isSick([1000, 2000, 3000], 4000)).toBe(true);
  expect(isSick([0, 30_000, 70_000], 75_000)).toBe(false);
});

test("destructive commands are spotted, ordinary ones are not", () => {
  for (const cmd of [
    "rm -rf node_modules",
    "git push --force origin main",
    "git push -f",
    "git reset --hard HEAD~1",
    "psql -c 'DROP TABLE users'",
    "supabase db reset",
    "vercel deploy --prod",
    "kubectl delete namespace staging",
    "terraform destroy",
    "docker system prune -a",
    "heroku apps:destroy my-app",
    "npm unpublish my-pkg@1.0.0",
    "chmod -R 777 /",
    "cat image.iso > /dev/sda",
  ]) {
    expect(isDangerous(cmd)).toBe(true);
  }
  for (const cmd of [
    "rm file.txt",
    "git push origin feat",
    "npm run lint",
    "git reset HEAD file",
    "kubectl get pods",
    "terraform plan",
    "docker system prune",
    "chmod -R 755 ./dist",
  ]) {
    expect(isDangerous(cmd)).toBe(false);
  }
});

test("food decays over time and edits are eaten by the line", () => {
  const pet = { ...newPet(0), food: 50, foodAt: 0 };
  expect(foodNow(pet, FOOD_DECAY_MS * 10)).toBe(40);
  expect(foodNow(pet, FOOD_DECAY_MS * 999)).toBe(0);
  expect(linesOf("Edit", { new_string: "a\nb\nc" })).toBe(3);
  expect(linesOf("Read", { file_path: "x" })).toBe(0);
});

test("a rerun of the same command cleans the bug it left", () => {
  expect(bugKey("Bash", { command: "npm test -- --watch=false" })).toBe(bugKey("Bash", { command: "npm test" }));
  expect(bugKey("Bash", { command: "pytest -x" })).not.toBe(bugKey("Bash", { command: "cargo test" }));
});

test("looks: panic beats everything, a full context stuffs it", () => {
  expect(lookOf("happy", { ...calm, panicUntil: 10 }, {}, 80, 5)).toBe("panic");
  expect(lookOf("working", calm, { context: 75 }, 80, 5)).toBe("stuffed");
  expect(lookOf("working", calm, { rate: 85 }, 80, 5)).toBe("anxious");
  expect(lookOf("sleepy", calm, {}, 5, 5)).toBe("hungry");
});

test("each species draws its own body; old saves are revived", () => {
  const born = { ...newPet(0), isHatched: true };
  const cat = art(born, "happy", 0, 0).join("\n");
  const frog = art({ ...born, species: "frog" }, "happy", 0, 0).join("\n");
  expect(cat).not.toBe(frog);
  expect(art(newPet(0), "happy", 0, 0).join("\n")).toContain(".--.");
  expect(revive({ name: "Bao", care: { reads: 3 } }, 0).care.edits).toBe(0);
});

test("extra danger patterns come from the option, and a bad one is skipped", () => {
  const extra = parsePatterns("\\bmake\\s+nuke\\b; ([unclosed ;  ; deploy --everywhere");
  expect(extra).toHaveLength(2);
  expect(isDangerous("make nuke", extra)).toBe(true);
  expect(isDangerous("./deploy --everywhere", extra)).toBe(true);
  expect(isDangerous("make build", extra)).toBe(false);
});

test("a new pet takes the configured name and species; a saved one keeps its own", () => {
  const fresh = revive(null, 0, "Bao", "frog");
  expect(fresh.name).toBe("Bao");
  expect(fresh.species).toBe("frog");
  const saved = revive({ name: "Mochi", species: "cat" }, 0, "Bao", "frog");
  expect(saved.name).toBe("Mochi");
  expect(saved.species).toBe("cat");
});

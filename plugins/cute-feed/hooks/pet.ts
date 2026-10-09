import type {
  Adult,
  Care,
  Effects,
  Mood,
  Pet,
  Species,
  Stage,
  Vitals,
} from "../types";

// Everything about the pet that needs no `$`: growth, care, looks and art.

export const HATCH_TURNS = 3;
export const FOOD_DECAY_MS = 6 * 60_000; // one point of food every 6 minutes
export const FEED_COOLDOWN_MS = 2 * 60_000;
export const SICK_WINDOW_MS = 60_000;
export const SICK_FAILS = 3;

export const SPECIES: Species[] = [
  "cat",
  "chick",
  "dog",
  "slime",
  "bunny",
  "hamster",
  "penguin",
  "frog",
];

export const isSpecies = (s: string): s is Species =>
  (SPECIES as string[]).includes(s);

const emptyCare = (): Care => ({
  acts: 0,
  night: 0,
  edits: 0,
  linesEaten: 0,
  reads: 0,
  searches: 0,
  bash: 0,
  agents: 0,
  fails: 0,
  bugsCleaned: 0,
  feeds: 0,
  pats: 0,
  plays: 0,
});

export const newPet = (
  now: number,
  name = "Mochi",
  species: Species = "cat",
): Pet => ({
  name,
  species,
  bornAt: now,
  xp: 0,
  turns: 0,
  isHatched: false,
  food: 80,
  foodAt: now,
  lastFedAt: 0,
  care: emptyCare(),
  bugs: [],
  adult: null,
});

// A pet read back from the store, filled in with any field an older version did not keep.
export const revive = (
  raw: unknown,
  now: number,
  name?: string,
  species?: Species,
): Pet => {
  const base = newPet(now, name, species);
  if (raw === null || typeof raw !== "object") return base;
  const p = raw as Partial<Pet>;
  return {
    ...base,
    ...p,
    care: { ...base.care, ...(p.care ?? {}) },
    bugs: p.bugs ?? [],
  };
};

// ---- growth ----

export const levelOf = (xp: number) =>
  Math.floor(Math.sqrt(Math.max(0, xp) / 20)) + 1;

export const xpForLevel = (level: number) => 20 * (level - 1) ** 2;

export const progressOf = (xp: number) => {
  const level = levelOf(xp);
  const from = xpForLevel(level);
  return (xp - from) / (xpForLevel(level + 1) - from);
};

export const shouldHatch = (pet: Pet) =>
  !pet.isHatched && pet.turns >= HATCH_TURNS;

export const stageOf = (pet: Pet): Stage => {
  if (!pet.isHatched) return "egg";
  const level = levelOf(pet.xp);
  if (level < 3) return "baby";
  if (level < 5) return "kid";
  if (level < 7) return "teen";
  return "adult";
};

// The adult form its upbringing points to; checked in order, the first match wins.
export const adultOf = (care: Care): Adult => {
  const acts = Math.max(1, care.acts);
  const share = (n: number) => n / acts;
  if (care.acts >= 20 && share(care.night) > 0.5) return "Owl";
  if (care.acts >= 20 && share(care.fails) > 0.15) return "Gremlin";
  if (care.feeds >= 8 && share(care.fails) < 0.05) return "Golden";
  if (care.agents >= 10 && share(care.agents) > 0.05) return "Shepherd";
  if (share(care.edits) > 0.35) return "Chonk";
  if (share(care.reads + care.searches) > 0.5) return "Scholar";
  if (share(care.bash) > 0.4) return "Hacker";
  return "Classic";
};

// ---- food ----

export const foodNow = (pet: Pet, now: number) =>
  Math.max(0, Math.min(100, pet.food - (now - pet.foodAt) / FOOD_DECAY_MS));

export const withFood = (pet: Pet, now: number, add: number): Pet => ({
  ...pet,
  food: Math.min(100, foodNow(pet, now) + add),
  foodAt: now,
});

// Lines of code a tool call wrote: what the pet eats.
export const linesOf = (tool: string, input: Record<string, unknown>) => {
  const text =
    tool === "Edit"
      ? input.new_string
      : tool === "Write"
        ? input.content
        : tool === "NotebookEdit"
          ? input.new_source
          : undefined;
  return typeof text === "string" && text.length > 0
    ? text.split("\n").length
    : 0;
};

// ---- trouble ----

export const isSick = (failTimes: readonly number[], now: number) =>
  failTimes.filter((t) => now - t < SICK_WINDOW_MS).length >= SICK_FAILS;

const DANGER = [
  /\brm\s+(-\w*r\w*f|-\w*f\w*r|-r\s+-f|-f\s+-r)\b/,
  /\bgit\s+push\b.*(--force\b|-f\b|--force-with-lease)/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+-\w*f/,
  /\bgit\s+branch\s+-D\b/,
  /\bdrop\s+(table|database|schema)\b/i,
  /\btruncate\s+table\b/i,
  /\bsupabase\s+db\s+(reset|push)\b/,
  /\bvercel\b.*--prod\b/,
  /\b(mkfs|dd\s+if=)/,
  /:\(\)\s*\{\s*:\|:&\s*\};:/,
  /\bkubectl\s+delete\b/,
  /\bterraform\s+(destroy|apply\b.*-auto-approve)/,
  /\bdocker\s+system\s+prune\b.*(-a\b|--all\b)/,
  /\bheroku\s+\S*destroy\b/,
  /\bnpm\s+unpublish\b/,
  /\bchmod\s+-R\s+777\s+\/(\s|$)/,
  />\s*\/dev\/sd[a-z]/,
];

// Extra patterns from the `dangerPatterns` option: `;`-separated regexes, case-insensitive; a bad one is skipped.
export const parsePatterns = (text: string): RegExp[] =>
  text
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      try {
        return [new RegExp(part, "i")];
      } catch {
        return [];
      }
    });

export const isDangerous = (command: string, extra: readonly RegExp[] = []) =>
  DANGER.some((re) => re.test(command)) || extra.some((re) => re.test(command));

// Which "bug" a failed call leaves: a later passing call with the same key cleans it.
export const bugKey = (tool: string, input: Record<string, unknown>) => {
  if (tool === "Bash" && typeof input.command === "string") {
    return `Bash:${input.command.trim().split(/\s+/).slice(0, 2).join(" ")}`;
  }
  const path = typeof input.file_path === "string" ? input.file_path : "";
  return `${tool}:${path}`;
};

export const isNight = (hour: number) => hour >= 22 || hour < 5;

// ---- looks ----

export type Look =
  | Mood
  | "eating"
  | "sick"
  | "panic"
  | "stuffed"
  | "anxious"
  | "patted"
  | "playing"
  | "hungry";

export const lookOf = (
  mood: Mood,
  fx: Effects,
  vitals: Vitals,
  food: number,
  now: number,
): Look => {
  if (now < fx.panicUntil) return "panic";
  if (now < fx.sickUntil) return "sick";
  if (now < fx.pattedUntil) return "patted";
  if (now < fx.playUntil) return "playing";
  if (now < fx.eatUntil) return "eating";
  if ((vitals.context ?? 0) > 90) return "panic";
  if ((vitals.context ?? 0) > 70) return "stuffed";
  if ((vitals.rate ?? 0) > 80) return "anxious";
  if (food < 15 && (mood === "sleepy" || mood === "happy")) return "hungry";
  return mood;
};

// Eyes, mouth and speech bubble, two frames per look.
const FACE: Record<Look, [[string, string, string], [string, string, string]]> =
  {
    sleepy: [
      ["-", ".", "z"],
      ["-", ".", "zZ"],
    ],
    thinking: [
      ["o", ".", "hmm?"],
      ["o", "-", "hmm…"],
    ],
    working: [
      ["O", ".", "⚡ on it"],
      ["O", "_", "⚡ on it!"],
    ],
    happy: [
      ["^", ".", "♥ yay!"],
      ["^", "ω", "♥ done!"],
    ],
    sad: [
      ["T", ".", "oops…"],
      [";", ".", "oh no"],
    ],
    eating: [
      ["^", "o", "nom"],
      ["^", "~", "nom nom"],
    ],
    sick: [
      ["x", "~", "🤢 ugh…"],
      ["@", "~", "🤢 bugs…"],
    ],
    panic: [
      ["◉", "□", "!!"],
      ["⊙", "□", "!!!"],
    ],
    stuffed: [
      ["@", "з", "😵 so full"],
      ["@", "ε", "😵 stuffed"],
    ],
    anxious: [
      ["°", "︿", "limits…"],
      ["º", "︿", "eep"],
    ],
    patted: [
      ["^", "///", "purr~"],
      ["^", "///", "purr~ ♥"],
    ],
    playing: [
      ["^", "▽", "🎾 wheee"],
      [">", "▽", "🎾 again!"],
    ],
    hungry: [
      ["・", "﹏", "hungry…"],
      ["・", "o", "🍙?"],
    ],
  };

export const LOOK_COLOR: Record<Look, string> = {
  sleepy: "gray",
  thinking: "cyan",
  working: "yellow",
  happy: "magenta",
  sad: "blue",
  eating: "green",
  sick: "green",
  panic: "red",
  stuffed: "yellow",
  anxious: "yellow",
  patted: "magenta",
  playing: "cyan",
  hungry: "gray",
};

type Body = { top: string; left: string; right: string; paws: string };

const BODIES: Record<Species, Body> = {
  cat: { top: " /\\_/\\", left: "( ", right: " )", paws: " > ^ <" },
  chick: { top: "  ,_,", left: " (", right: ")>", paws: "  ^^" },
  dog: { top: " ∪‾‾∪", left: "U(", right: ")U", paws: "  ⊔⊔" },
  slime: { top: "  .--.", left: " (", right: ") ", paws: " ~~~~~" },
  bunny: { top: " (\\(\\", left: " (", right: ") ", paws: ' o(")(")' },
  hamster: { top: " ()_()", left: "(•", right: "•)", paws: ' (")(")' },
  penguin: { top: "  .-.", left: " (", right: ") ", paws: " /(_)\\" },
  frog: { top: " @..@", left: "(", right: ")", paws: " (>  <)" },
};

const ADULT_LOOK: Record<
  Adult,
  { hat: string[]; tail: string; color?: string }
> = {
  Golden: { hat: ["   ♛"], tail: " ✨", color: "yellow" },
  Chonk: { hat: [], tail: " ▓▓", color: "magenta" },
  Scholar: { hat: ["  _🎓_"], tail: " 📚" },
  Gremlin: { hat: [" ^v^v^"], tail: " 🐛", color: "green" },
  Shepherd: { hat: [], tail: " ʃ🐣🐣" },
  Owl: { hat: ["  ☾ ."], tail: " 🦉", color: "blue" },
  Hacker: { hat: [], tail: " >_", color: "green" },
  Classic: { hat: [], tail: " ♡" },
};

export const adultColor = (adult: Adult | null) =>
  adult ? ADULT_LOOK[adult].color : undefined;

// The pet as text lines for one frame.
export const art = (
  pet: Pet,
  look: Look,
  frame: number,
  now: number,
): string[] => {
  const f = frame % 2;
  const stage = stageOf(pet);

  if (stage === "egg") {
    const isCracking = pet.turns >= HATCH_TURNS - 1;
    const wobble = f === 0 ? "" : " ";
    return [
      `${wobble}  .--.`,
      `${wobble} /${isCracking ? " ⚡ " : "    "}\\`,
      `${wobble} \\____/`,
    ];
  }

  const [eyes, mouth, bubble] = FACE[look][f] as [string, string, string];
  const body = BODIES[pet.species];
  const extra = stage === "teen" ? " ʚɞ" : "";
  const adult = stage === "adult" && pet.adult ? ADULT_LOOK[pet.adult] : null;
  const small = stage === "baby" ? "·" : "";

  const lines = [
    ...(adult?.hat ?? []),
    `${body.top}${extra}`,
    `${body.left}${eyes}${mouth}${eyes}${body.right}${small}  ${bubble}`,
    `${look === "eating" ? " 🍙" : ""}${body.paws}${adult?.tail ?? ""}`,
  ];

  // Playing: the pet bounces side to side between frames.
  if (look === "playing") return lines.map((l) => (f === 0 ? l : `  ${l}`));
  // Panic: it shakes.
  if (look === "panic" && Math.floor(now / 150) % 2 === 0)
    return lines.map((l) => ` ${l}`);
  return lines;
};

export const stageLabel = (pet: Pet) => {
  const stage = stageOf(pet);
  if (stage === "egg")
    return `egg · hatches in ${Math.max(0, HATCH_TURNS - pet.turns)} turn(s)`;
  if (stage === "adult" && pet.adult)
    return `Lv ${levelOf(pet.xp)} ${pet.adult} ${pet.species}`;
  return `Lv ${levelOf(pet.xp)} ${stage} ${pet.species}`;
};

export const meter = (value: number, width = 10) => {
  const filled = Math.round((Math.max(0, Math.min(100, value)) / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
};

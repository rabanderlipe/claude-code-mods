export type Mood = "sleepy" | "thinking" | "working" | "happy" | "sad";

export type Species =
  | "cat"
  | "chick"
  | "dog"
  | "slime"
  | "bunny"
  | "hamster"
  | "penguin"
  | "frog";

export type Adult =
  | "Golden"
  | "Chonk"
  | "Scholar"
  | "Gremlin"
  | "Shepherd"
  | "Owl"
  | "Hacker"
  | "Classic";

export type Stage = "egg" | "baby" | "kid" | "teen" | "adult";

// How the pet was raised, across sessions: what decides its adult form.
export type Care = {
  acts: number;
  night: number;
  edits: number;
  linesEaten: number;
  reads: number;
  searches: number;
  bash: number;
  agents: number;
  fails: number;
  bugsCleaned: number;
  feeds: number;
  pats: number;
  plays: number;
};

export type Bug = { key: string; at: number };

export type Pet = {
  name: string;
  species: Species;
  bornAt: number;
  xp: number;
  turns: number;
  isHatched: boolean;
  food: number;
  foodAt: number;
  lastFedAt: number;
  care: Care;
  bugs: Bug[];
  adult: Adult | null;
};

export type Vitals = { context?: number; rate?: number };

export type Effects = {
  pattedUntil: number;
  playUntil: number;
  eatUntil: number;
  sickUntil: number;
  panicUntil: number;
};

export type FeedItem = {
  id: string;
  at: number;
  icon: string;
  text: string;
  isDim: boolean;
};

export type Stats = {
  tools: number;
  agents: number;
  turns: number;
  oops: number;
};

declare module "claude-code" {
  interface PluginState {
    "cute-feed": {
      feed: FeedItem[];
      mood: Mood;
      frame: number;
      stats: Stats;
      pet: Pet | null;
      vitals: Vitals;
      effects: Effects;
    };
  }
}

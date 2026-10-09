export type Suite = "lint" | "unit" | "int" | "db" | "e2e" | "typecheck";

export type Boss = {
  suite: Suite;
  name: string;
  sprite: string;
  hp: number;
  maxHp: number;
  hits: number;
  spawnedAt: number;
  last: string;
};

export type Victory = { text: string; until: number };

declare module "claude-code" {
  interface PluginState {
    "boss-fight": { bosses: Boss[]; victory: Victory | null };
  }
}

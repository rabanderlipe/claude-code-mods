export type TouchKind = "read" | "write" | "fail";

export type Touch = {
  reads: number;
  writes: number;
  fails: number;
  lastAt: number;
  lastKind: TouchKind;
  agent: string;
};

export type AgentTag = { name: string; color: string };

declare module "claude-code" {
  interface PluginState {
    "repo-radar": {
      root: string;
      isRepo: boolean;
      files: string[];
      touches: Record<string, Touch>;
      agents: Record<string, AgentTag>;
      now: number;
    };
  }
}

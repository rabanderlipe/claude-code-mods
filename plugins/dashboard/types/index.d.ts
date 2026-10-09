export type AgentRun = {
  id: string;
  type: string;
  description: string;
  model: string;
  startedAt: number;
  durationMs?: number;
  tools: number;
  status: "running" | "done" | "aborted";
};

export type Activity = {
  at: number;
  tool: string;
  agent: string;
  isDone: boolean;
  id: string;
};

export type Project = {
  name: string;
  branch: string;
  hasUpstream: boolean;
  dirty: number;
  ahead: number;
  behind: number;
  lastCommit: string;
  worktrees: number;
};

export type Usage = {
  model: string;
  startedAt: number;
  contextPercent?: number;
  costUsd?: number;
  limits: { kind: string; percentUsed: number }[];
  turns: number;
  now: number;
};

declare module "claude-code" {
  interface PluginState {
    dashboard: {
      agents: AgentRun[];
      activity: Activity[];
      project: Project | null;
      usage: Usage | null;
    };
  }
}

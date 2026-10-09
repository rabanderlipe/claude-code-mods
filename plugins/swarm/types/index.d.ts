export type AgentStatus = "running" | "done" | "aborted";

export type AgentNode = {
  id: string;
  parentId?: string;
  type: string;
  label: string;
  model: string;
  startedAt: number;
  durationMs?: number;
  tools: number;
  status: AgentStatus;
  current?: string;
  runId?: string;
  agentIndex?: number;
  teammate?: string;
};

export type MainNode = { model: string; current?: string; tools: number };

declare module "claude-code" {
  interface PluginState {
    swarm: {
      nodes: AgentNode[];
      main: MainNode;
      frame: number;
      peak: number;
    };
  }
}

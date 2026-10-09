export type LastRoute = { model: string; reason: string; text: string };

declare module "claude-code" {
  interface PluginState {
    "model-router": { last: LastRoute | null };
  }
}

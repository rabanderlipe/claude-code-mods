// How a tool call reads in the feed: an emoji and a few words.

const ICONS: Record<string, string> = {
  Read: "📖",
  Edit: "✏️ ",
  Write: "📝",
  Bash: "💻",
  Grep: "🔍",
  Glob: "🗂️ ",
  Agent: "🐣",
  WebFetch: "🌐",
  WebSearch: "🔭",
  Skill: "🎓",
  TodoWrite: "📋",
};

export const iconFor = (tool: string) => ICONS[tool] ?? (tool.startsWith("mcp__") ? "🔌" : "🔧");

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// What a tool call is about, in a few words: the file, the command or the pattern.
export const describe = (tool: string, input: Record<string, unknown>) => {
  const pick = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : undefined);
  const path = pick("file_path") ?? pick("path");
  const subject =
    pick("command") ??
    (path ? path.split("/").slice(-2).join("/") : undefined) ??
    pick("pattern") ??
    pick("description") ??
    pick("url") ??
    pick("skill") ??
    "";
  return short(`${tool} ${subject}`.trim(), 48);
};

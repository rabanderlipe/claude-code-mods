import { expect, test } from "claude-code/testing";

import { configFrom, describeConfig, route, stripOverride } from "./route";

test("routine commands go light", () => {
  expect(route("commit this")?.tier).toBe("light");
  expect(route("run the tests")?.tier).toBe("light");
});

test("short questions go standard", () => {
  expect(route("where is the config loader defined?")?.tier).toBe("standard");
});

test("complex work stays heavy", () => {
  expect(route("debug why the login form fails on submit")?.tier).toBe("heavy");
  expect(route("what should the architecture be for sync?")?.tier).toBe(
    "heavy",
  );
});

test("overrides win and are stripped", () => {
  expect(route("!haiku refactor everything")).toEqual({
    tier: "light",
    reason: "forced",
  });
  expect(stripOverride("!opus hi")).toBe("hi");
});

test("slash commands and open-ended prompts are left alone", () => {
  expect(route("/review")).toBe(null);
  expect(
    route("add a settings screen with a theme toggle and an account section"),
  ).toBe(null);
});

test("config falls back to defaults and reads options", () => {
  const d = configFrom({});
  expect(d.models.light).toBe("claude-haiku-5-5");
  expect(d.maxMessages).toBe(40);
  expect([...d.lightAgents]).toEqual([
    "Explore",
    "claude-code-guide",
    "statusline-setup",
  ]);

  const c = configFrom({
    lightModel: "my-small",
    lightAgents: " Explore , scout ",
    routeSubagents: false,
    maxMessages: 10,
  });
  expect(c.models.light).toBe("my-small");
  expect([...c.lightAgents]).toEqual(["Explore", "scout"]);
  expect(describeConfig(c)).toContain("subagents not routed");
  expect(describeConfig(c)).toContain("up to 10 messages");
});

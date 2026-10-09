import type { On, TurnCompleteInput } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

import { defaultsFrom } from "./register";

const turn = (durationMs: number, agentId?: string) =>
  ({
    answer: "ok",
    durationMs,
    isAborted: false,
    turnId: "t1",
    reason: "answer",
    ...(agentId ? { agentId } : {}),
  }) as TurnCompleteInput;

const setup = (on: On) => {
  const played: string[] = [];
  const notified: string[] = [];
  on("audio.play", (_$, e) => {
    const clip = e.clip as { asset?: string };
    played.push(String(clip.asset));
    return { value: undefined };
  });
  on("ui.notify", (_$, e) => {
    notified.push(e.text);
    return { value: { isSent: true, channel: "test" } } as never;
  });
  on("turn.complete", () => ({ text: "ok" }));
  on("classic.Notification", () => ({}) as never);
  return { played, notified };
};

test("defaults come from options", () => {
  expect(defaultsFrom({})).toEqual({
    thresholdSec: 45,
    notify: true,
    waitingSound: true,
  });
  expect(
    defaultsFrom({ thresholdSeconds: 90, notify: false, waitingSound: false }),
  ).toEqual({
    thresholdSec: 90,
    notify: false,
    waitingSound: false,
  });
});

test("a long main turn chimes and notifies", async ($, on) => {
  mock.store(on);
  const { played, notified } = setup(on);
  await $.turn.complete(turn(60_000));
  expect(played).toEqual(["assets/done.wav"]);
  expect(notified).toEqual(["Done in 60s"]);
});

test("short turns and subagent turns stay quiet", async ($, on) => {
  mock.store(on, { thresholdSec: 45 });
  const { played } = setup(on);
  await $.turn.complete(turn(10_000));
  await $.turn.complete(turn(90_000, "agent-1"));
  expect(played).toEqual([]);
});

test(
  "the configured threshold applies until /chime overrides it",
  { options: { thresholdSeconds: 120 } },
  async ($, on) => {
    mock.store(on);
    const { played } = setup(on);
    await $.turn.complete(turn(60_000));
    expect(played).toEqual([]);
    await $.turn.complete(turn(130_000));
    expect(played).toEqual(["assets/done.wav"]);
  },
);

test(
  "a stored /chime threshold beats the configured one",
  { options: { thresholdSeconds: 120 } },
  async ($, on) => {
    mock.store(on, { thresholdSec: 30 });
    const { played } = setup(on);
    await $.turn.complete(turn(60_000));
    expect(played).toEqual(["assets/done.wav"]);
  },
);

test(
  "notify off chimes without a notification",
  { options: { notify: false } },
  async ($, on) => {
    mock.store(on);
    const { played, notified } = setup(on);
    await $.turn.complete(turn(60_000));
    expect(played).toEqual(["assets/done.wav"]);
    expect(notified).toEqual([]);
  },
);

test("the off switch silences it", async ($, on) => {
  mock.store(on, { isOn: false });
  const { played } = setup(on);
  await $.turn.complete(turn(90_000));
  expect(played).toEqual([]);
});

test("a permission wait plays the softer chime", async ($, on) => {
  mock.store(on);
  const { played } = setup(on);
  await $.classic.Notification({
    message: "Claude needs your permission",
    notification_type: "permission_prompt",
  });
  expect(played).toEqual(["assets/waiting.wav"]);
});

test(
  "waitingSound off keeps permission waits quiet",
  { options: { waitingSound: false } },
  async ($, on) => {
    mock.store(on);
    const { played } = setup(on);
    await $.classic.Notification({
      message: "Claude needs your permission",
      notification_type: "permission_prompt",
    });
    expect(played).toEqual([]);
  },
);

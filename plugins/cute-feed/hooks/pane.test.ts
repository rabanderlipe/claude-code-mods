import type { CommandRunInput } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

import { newPet } from "./pet";

const PANE = { component: "Pane", requestId: "cute-feed", props: { title: "Pet", isFocused: false } } as const;
const hatched = { ...newPet(0, "Bao", "bunny"), isHatched: true };

for (const surface of ["terminal", "desktop"] as const) {
  test(`patting makes it blush on ${surface}`, async ($, on) => {
    mock.clock(on);
    mock.store(on, { pet: hatched });
    const ui = await $.ui.mount({ plugin: "cute-feed", surface, ...PANE } as Parameters<typeof $.ui.mount>[0]);
    await ui.press({ key: "pat" });
    expect(await ui.findAll({ text: /purr/ })).not.toHaveLength(0);
    expect(await ui.findAll({ text: /you patted me/ })).not.toHaveLength(0);
  });
}

test("the stored species is drawn, and /feed species changes and keeps it", async ($, on) => {
  mock.clock(on);
  mock.store(on, { pet: hatched });
  const ui = await $.ui.mount({ plugin: "cute-feed", surface: "terminal", ...PANE } as Parameters<typeof $.ui.mount>[0]);
  expect(await ui.findAll({ text: /baby bunny/ })).not.toHaveLength(0);

  const ran = await $.command.run({ command: "feed", args: "species frog" } as CommandRunInput);
  expect(ran.text).toContain("frog");
  expect(await ui.findAll({ text: /baby frog/ })).not.toHaveLength(0);

  const bad = await $.command.run({ command: "feed", args: "species dragon" } as CommandRunInput);
  expect(bad.text).toContain("Pick one of");
});

test("a new pet starts as an egg", async ($, on) => {
  mock.clock(on);
  mock.store(on);
  const ui = await $.ui.mount({ plugin: "cute-feed", surface: "terminal", ...PANE } as Parameters<typeof $.ui.mount>[0]);
  expect(await ui.findAll({ text: /hatches in 3/ })).not.toHaveLength(0);
});

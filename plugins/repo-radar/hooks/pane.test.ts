import { expect, mock, test } from "claude-code/testing";

for (const surface of ["terminal", "desktop"] as const) {
  test(`a read and a failed edit light up the map on ${surface}`, async ($, on) => {
    mock.clock(on);
    on("tool.call", (_$, e) =>
      e.tool === "Edit"
        ? { result: "no", text: "no", isError: true }
        : { result: "ok", text: "ok" },
    );

    await $.tool.call({
      tool: "Read",
      file_path: "/lib/money.ts",
    } as Parameters<typeof $.tool.call>[0]);
    await $.tool.call({
      tool: "Edit",
      file_path: "/lib/money.ts",
      old_string: "a",
      new_string: "b",
    } as Parameters<typeof $.tool.call>[0]);

    const ui = await $.ui.mount({
      plugin: "repo-radar",
      surface,
      component: "Pane",
      requestId: "repo-radar",
      props: { title: "Radar", isFocused: false },
    } as Parameters<typeof $.ui.mount>[0]);

    expect(await ui.findAll({ text: /money\.ts/ })).not.toHaveLength(0);
    expect(await ui.findAll({ text: /!1/ })).not.toHaveLength(0);
    expect(await ui.findAll({ text: /failed 1/ })).not.toHaveLength(0);
  });
}

import { expect, mock, test } from 'claude-code/testing'

const bash = (command: string) => ({ tool: 'Bash', command }) as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a failing then passing suite spawns, damages and slays its boss on ${surface}`, async ($, on) => {
    mock.clock(on)
    mock.store(on)
    const outputs = [
      { isError: true as const, result: 'x', text: 'Tests  4 failed | 1 passed\nExit code 1' },
      { isError: true as const, result: 'x', text: 'Tests  1 failed | 4 passed\nExit code 1' },
      { result: { stdout: '' }, text: 'Tests  5 passed' },
    ]
    let i = 0
    on('tool.call', () => outputs[i++] as never)

    const band = () =>
      $.ui.mount({ plugin: 'boss-fight', surface, component: 'AbovePrompt', props: { hasSurvey: false } } as Parameters<
        typeof $.ui.mount
      >[0])

    await $.tool.call(bash('npm test'))
    let ui = await band()
    expect(await ui.findAll({ text: /Test Slime/ })).not.toHaveLength(0)
    expect(await ui.findAll({ text: /4\/4/ })).not.toHaveLength(0)
    await ui.unmount()

    await $.tool.call(bash('npm test'))
    ui = await band()
    expect(await ui.findAll({ text: /1\/4/ })).not.toHaveLength(0)
    await ui.unmount()

    await $.tool.call(bash('npm test'))
    ui = await band()
    expect(await ui.findAll({ text: /defeated Test Slime/ })).not.toHaveLength(0)
    expect(await ui.findAll({ text: /1 slain/ })).not.toHaveLength(0)
  })
}

test('a suite left out of enabledSuites never spawns a boss', { options: { enabledSuites: 'lint' } }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ isError: true, result: 'x', text: 'Tests  4 failed\nExit code 1' }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })
  await $.tool.call(bash('cargo test'))
  const ui = await $.ui.mount({
    plugin: 'boss-fight',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false },
  } as Parameters<typeof $.ui.mount>[0])
  expect(await ui.findAll({ text: /Slime/ })).toHaveLength(0)
  expect(await ui.findAll({ text: /engine band/ })).not.toHaveLength(0)
})

test('an extra pattern from userConfig spawns its boss', { options: { extraPatterns: 'e2e=\\bmake smoke\\b' } }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ isError: true, result: 'x', text: '2 failed\nExit code 2' }) as never)
  await $.tool.call(bash('make smoke'))
  const ui = await $.ui.mount({
    plugin: 'boss-fight',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false },
  } as Parameters<typeof $.ui.mount>[0])
  expect(await ui.findAll({ text: /Flaky E2E Hydra/ })).not.toHaveLength(0)
  expect(await ui.findAll({ text: /2\/2/ })).not.toHaveLength(0)
})

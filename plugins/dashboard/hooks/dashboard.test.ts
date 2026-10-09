import type { AgentSpawnInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const spawn: AgentSpawnInput = {
  tool_use_id: 't1',
  prompt: 'look',
  description: 'look around',
  subagentType: 'Explore',
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'claude-opus-5-5',
  background: false,
  fork: false,
} as AgentSpawnInput

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a spawned subagent shows as running on ${surface}`, async ($, on) => {
    mock.clock(on)
    on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'ag1' }))
    await $.agent.spawn(spawn)

    const ui = await $.ui.mount({
      plugin: 'dashboard',
      surface,
      component: 'Pane',
      requestId: 'dashboard',
      props: { title: 'Dashboard', isFocused: false },
    } as Parameters<typeof $.ui.mount>[0])
    expect(await ui.findAll({ text: /1 running/ })).not.toHaveLength(0)
    expect(await ui.findAll({ text: /look around/ })).not.toHaveLength(0)
  })
}

import { expect, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const
const PROPS = { hasSurvey: false, isWorking: false, maxRows: 10 }

for (const surface of SURFACES) {
  test(`shows context fill after a measurement on ${surface}`, async ($, on) => {
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('ui.render', () => ({ type: 'Box', children: [] }) as never)
    await $.session.measure({
      context: { tokens: 90_000, window: 200_000, percent: 45 },
      rateLimits: [],
      changed: ['context'],
    })
    const ui = await $.ui.mount({ plugin: 'memory-bar', surface, component: 'AbovePrompt', props: PROPS as never })
    expect(await ui.find({ text: '45%' })).toBeDefined()
  })

  test(`warns when memory is nearly full on ${surface}`, async ($, on) => {
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('ui.render', () => ({ type: 'Box', children: [] }) as never)
    await $.session.measure({
      context: { tokens: 180_000, window: 200_000, percent: 90 },
      rateLimits: [],
      changed: ['context'],
    })
    const ui = await $.ui.mount({ plugin: 'memory-bar', surface, component: 'AbovePrompt', props: PROPS as never })
    expect((await ui.find({ text: '/compact' }))).toBeDefined()
  })
}

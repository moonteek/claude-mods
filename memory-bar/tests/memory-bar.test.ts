import { expect, mock, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const
const PROPS = { hasSurvey: false, isWorking: false, maxRows: 10 }

for (const surface of SURFACES) {
  test(`shows context fill after a measurement on ${surface}`, async ($, on) => {
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    mock.clock(on)
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
    mock.clock(on)
    on('ui.render', () => ({ type: 'Box', children: [] }) as never)
    await $.session.measure({
      context: { tokens: 180_000, window: 200_000, percent: 90 },
      rateLimits: [],
      changed: ['context'],
    })
    const ui = await $.ui.mount({ plugin: 'memory-bar', surface, component: 'AbovePrompt', props: PROPS as never })
    expect((await ui.find({ text: '/compact' }))).toBeDefined()
  })

  test(`shows each rate-limit window with its reset on ${surface}`, async ($, on) => {
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    const clock = mock.clock(on)
    on('ui.render', () => ({ type: 'Box', children: [] }) as never)
    const now = clock.now()
    const inTwoHours = new Date(now + (2 * 60 + 14) * 60_000 + 20_000).toISOString()
    const inFourDays = new Date(now + (4 * 24 + 3) * 3_600_000 + 20_000).toISOString()
    await $.session.measure({
      context: { tokens: 90_000, window: 200_000, percent: 45 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 32.5, resetsAt: inTwoHours },
        { kind: 'seven_day', percentUsed: 88, resetsAt: inFourDays },
      ],
      changed: ['context', 'rateLimits'],
    })
    const ui = await $.ui.mount({ plugin: 'memory-bar', surface, component: 'AbovePrompt', props: PROPS as never })
    expect(await ui.find({ text: '5-hour' })).toBeDefined()
    expect(await ui.find({ text: 'resets in 2h 14m' })).toBeDefined()
    expect(await ui.find({ text: 'weekly' })).toBeDefined()
    expect(await ui.find({ text: 'resets in 4d 3h' })).toBeDefined()
    expect(await ui.find({ text: '88%' })).toBeDefined()
  })
}

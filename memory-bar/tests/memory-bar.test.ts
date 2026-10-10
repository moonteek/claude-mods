import { expect, mock, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const
const PROPS = { hasSurvey: false, isWorking: false, maxRows: 10 }

for (const surface of SURFACES) {
  test(`shows context fill after a measurement on ${surface}`, async ($, on) => {
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    mock.clock(on)
    mock.store(on)
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
    mock.store(on)
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
    mock.store(on)
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

  test(`a new session shows the limits another session saved on ${surface}`, async ($, on) => {
    const clock = mock.clock(on, { now: Date.parse('2026-10-10T11:00:00Z') })
    mock.store(on, {
      rateLimits: {
        at: clock.now(),
        limits: [
          { kind: 'five_hour', percent: 64, resetsAt: '2026-10-10T13:00:00.000Z' },
          { kind: 'seven_day', percent: 66, resetsAt: '2026-10-14T04:00:00.000Z' },
        ],
      },
    })
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    // A fresh session: no reply yet, so the engine has no rate limits.
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }) as never)
    on('ui.render', () => ({ type: 'Box', children: [] }) as never)
    await $.session.start({ source: 'startup', cwd: 'C:/work' } as never)

    const ui = await $.ui.mount({ plugin: 'memory-bar', surface, component: 'AbovePrompt', props: PROPS as never })
    expect(await ui.find({ text: '64%' })).toBeDefined()
    expect(await ui.find({ text: 'resets in 2h 0m' })).toBeDefined()
    expect(await ui.find({ text: '66%' })).toBeDefined()
  })

  test(`a saved window past its reset shows as reset on ${surface}`, async ($, on) => {
    mock.clock(on, { now: Date.parse('2026-10-10T14:00:00Z') })
    mock.store(on, {
      rateLimits: { at: 0, limits: [{ kind: 'five_hour', percent: 64, resetsAt: '2026-10-10T13:00:00.000Z' }] },
    })
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }) as never)
    on('ui.render', () => ({ type: 'Box', children: [] }) as never)
    await $.session.start({ source: 'startup', cwd: 'C:/work' } as never)

    const ui = await $.ui.mount({ plugin: 'memory-bar', surface, component: 'AbovePrompt', props: PROPS as never })
    expect(await ui.find({ text: 'just reset' })).toBeDefined()
    expect(await ui.find({ text: '64%' })).toBeUndefined()
  })
}

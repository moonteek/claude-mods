import { expect, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const
const PROPS = { hasSurvey: false, isWorking: true, maxRows: 20, bodyColumns: 100 }

const todos = [
  { content: 'Set up routes', activeForm: 'Setting up routes', status: 'completed' },
  { content: 'Build the form', activeForm: 'Building the form', status: 'in_progress' },
  { content: 'Write tests', activeForm: 'Writing tests', status: 'pending' },
]

for (const surface of SURFACES) {
  test(`shows the steps and progress on ${surface}`, async ($, on) => {
    on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
    on('ui.render', () => ({ type: 'Box', children: [] }) as never)
    on('tool.call', () => ({ result: { oldTodos: [], newTodos: todos } }) as never)
    await $.prompt.submit({ text: 'Build a login page' } as never)
    await $.tool.call({ tool: 'TodoWrite', todos } as never)

    const ui = await $.ui.mount({ plugin: 'task-steps', surface, component: 'AbovePrompt', props: PROPS as never })
    expect(await ui.find({ text: 'Build a login page' })).toBeDefined()
    expect(await ui.find({ text: '1/3' })).toBeDefined()
    expect(await ui.find({ text: 'Building the form…' })).toBeDefined()
    expect(await ui.find({ text: 'Write tests' })).toBeDefined()
  })

  test(`its own steps tool drives the checklist on ${surface}`, async ($, on) => {
    on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
    on('ui.render', () => ({ type: 'Box', children: [] }) as never)
    await $.prompt.submit({ text: 'Refactor the API' } as never)
    const ran = await $.tool.call({ tool: 'mcp__task-steps__steps', steps: todos } as never)
    expect(ran.result).toBe('Checklist shown: 1/3 steps done.')

    const ui = await $.ui.mount({ plugin: 'task-steps', surface, component: 'AbovePrompt', props: PROPS as never })
    expect(await ui.find({ text: 'Refactor the API' })).toBeDefined()
    expect(await ui.find({ text: '1/3' })).toBeDefined()
  })

  test(`a new prompt replaces an unfinished task on ${surface}`, async ($, on) => {
    on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
    on('ui.render', () => ({ type: 'Box', children: [] }) as never)
    await $.prompt.submit({ text: 'Old task' } as never)
    await $.tool.call({ tool: 'mcp__task-steps__steps', steps: todos } as never)

    await $.prompt.submit({ text: 'New task' } as never)
    const ui = await $.ui.mount({ plugin: 'task-steps', surface, component: 'AbovePrompt', props: PROPS as never })
    expect(await ui.find({ text: 'Old task' })).toBeUndefined()

    const fresh = [{ content: 'Plan it', activeForm: 'Planning it', status: 'in_progress' }]
    await $.tool.call({ tool: 'mcp__task-steps__steps', steps: fresh } as never)
    expect(await ui.find({ text: 'New task' })).toBeDefined()
    expect(await ui.find({ text: '0/1' })).toBeDefined()
    expect(await ui.find({ text: 'Old task' })).toBeUndefined()
  })
}

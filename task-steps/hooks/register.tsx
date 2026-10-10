import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Step, StepStatus, Task } from '../types'

const ACCENT = '#D97757'
const BAR = 14
const task = atom({ plugin: 'task-steps', key: 'task' } as const, null)
const prompt = atom({ plugin: 'task-steps', key: 'prompt' } as const, '')

const cut = (text: string, room: number) =>
  text.length <= room ? text : `${text.slice(0, Math.max(1, room - 1))}…`

const isFinished = (current: Task | null) =>
  current === null || current.steps.every(step => step.status === 'completed')

// The first list after a prompt (or after the last list finished) takes that prompt as its title.
const withSteps = (current: Task | null, title: string, steps: Step[]): Task | null =>
  steps.length === 0 ? null : { title: isFinished(current) ? title : (current?.title ?? title), steps }

type Todo = { content: string; activeForm: string; status: StepStatus }

const showTodos = async ($: Parameters<typeof read>[0], todos: readonly Todo[]) => {
  const title = await read($, prompt)
  const steps = todos.map((todo, i) => ({
    id: String(i),
    label: todo.content,
    active: todo.activeForm,
    status: todo.status,
  }))
  await update($, task, current => withSteps(current, title, steps))
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    const line = e.text.trim().split('\n')[0] ?? ''
    if (line !== '' && !line.startsWith('/')) {
      // A new prompt is a new task: clear the old checklist so the next plan starts fresh under this title.
      await update($, prompt, () => line)
      await update($, task, () => null)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Where neither TodoWrite nor TaskCreate is on hand, Claude reports its plan through this mod's own tool.
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.tool.register({
      name: 'steps',
      description:
        'Show the user a live checklist of the steps for their current task, above their prompt. ' +
        'For any task with 3 or more steps: call it once with the full plan before starting, then again ' +
        'each time a step starts or finishes, always sending the whole list. Keep exactly one step ' +
        'in_progress while working, and mark every step completed when done.',
      inputSchema: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                content: { type: 'string', description: 'The step, imperative: "Write tests"' },
                activeForm: { type: 'string', description: 'The step while it runs: "Writing tests"' },
                status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
              },
              required: ['content', 'activeForm', 'status'],
            },
          },
        },
        required: ['steps'],
      },
      isDeferred: false,
    })
    return result
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: /^mcp__task-steps__steps$/ }, async ($, e) => {
    const todos = (e as unknown as { steps?: Todo[] }).steps ?? []
    await showTodos($, todos)
    const done = todos.filter(todo => todo.status === 'completed').length
    return { result: `Checklist shown: ${done}/${todos.length} steps done.` }
  })

  // Claude's plan arrives whole through TodoWrite...
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      await showTodos($, e.todos)
    }
    return ran
  }).catch(($, e, next) => next(e))

  // ...or one step at a time through TaskCreate and TaskUpdate.
  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      const id = (ran.result as { task?: { id?: string } } | undefined)?.task?.id ?? e.subject
      const title = await read($, prompt)
      const step: Step = { id, label: e.subject, active: e.activeForm ?? e.subject, status: 'pending' }
      await update($, task, current =>
        withSteps(current, title, [...(isFinished(current) ? [] : (current?.steps ?? [])), step]),
      )
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      await update($, task, current => {
        if (current === null) return null
        const steps = current.steps
          .filter(step => !(step.id === e.taskId && e.status === 'deleted'))
          .map(step =>
            step.id !== e.taskId
              ? step
              : {
                  ...step,
                  label: e.subject ?? step.label,
                  active: e.activeForm ?? step.active,
                  status: (e.status === undefined || e.status === 'deleted' ? step.status : e.status) as StepStatus,
                },
          )
        return steps.length === 0 ? null : { ...current, steps }
      })
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const current = await read($, task)
    if (e.props.hasSurvey || current === null) {
      return below
    }

    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(30, e.props.bodyColumns)
    const total = current.steps.length
    const done = current.steps.filter(step => step.status === 'completed').length
    const filled = Math.round((done / total) * BAR)
    const isDone = done === total

    // Show a window of steps around the one in hand when they don't all fit.
    const room = Math.max(1, Math.min(8, e.props.maxRows - 4))
    const focus = Math.max(0, current.steps.findIndex(step => step.status !== 'completed'))
    const start = Math.max(0, Math.min(focus - 1, total - room))
    const shown = current.steps.slice(start, start + room)
    const hidden = total - shown.length

    const row = (step: Step) => {
      if (step.status === 'completed') {
        return (
          <Box>
            <Text color={ACCENT}>{'  ✓ '}</Text>
            <Text dimColor strikethrough>{cut(step.label, width - 4)}</Text>
          </Box>
        )
      }
      if (step.status === 'in_progress') {
        return (
          <Box>
            <Text color={ACCENT} bold>{'  ◉ '}</Text>
            <Text bold>{cut(`${step.active}…`, width - 4)}</Text>
          </Box>
        )
      }
      return (
        <Box>
          <Text dimColor>{`  ○ ${cut(step.label, width - 4)}`}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box>
          <Text color={ACCENT}>{isDone ? '◆ ' : '◇ '}</Text>
          <Text bold>{cut(current.title || 'Task', Math.max(8, width - BAR - 16))}</Text>
          <Text>{'  '}</Text>
          <Text color={ACCENT}>{'━'.repeat(filled)}</Text>
          <Text dimColor>{'─'.repeat(BAR - filled)}</Text>
          <Text color={ACCENT} bold>{`  ${done}/${total}`}</Text>
          {isDone ? <Text dimColor>{'  done'}</Text> : null}
        </Box>
        {isDone ? null : shown.map(row)}
        {!isDone && hidden > 0 ? <Text dimColor>{`    +${hidden} more`}</Text> : null}
        {below}
      </Box>
    )
  })
}

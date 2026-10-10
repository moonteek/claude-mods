import { atom, read, update } from 'claude-code'
import type { Register, SessionContextUsage } from 'claude-code'

import type { Memory } from '../types'

const WIDTH = 20
const ACCENT = '#D97757'
const AMBER = '#E2A84B'
const CRIMSON = '#E5484D'
const memory = atom({ plugin: 'memory-bar', key: 'memory' } as const, null)

const toMemory = (context: SessionContextUsage): Memory | null =>
  context.tokens === undefined
    ? null
    : {
        tokens: context.tokens,
        window: context.window,
        percent: context.percent ?? Math.round((context.tokens / context.window) * 100),
      }

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

// The icon fills like a gauge: ○ ◔ ◑ ◕ ●
const icon = (percent: number) => '○◔◑◕●'[Math.min(4, Math.floor(percent / 20))]

export const bar = (percent: number) => {
  const filled = Math.max(0, Math.min(WIDTH, Math.round((percent / 100) * WIDTH)))
  return { filled: '━'.repeat(filled), empty: '─'.repeat(WIDTH - filled) }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const { context } = await $.session.usage()
    await update($, memory, () => toMemory(context))
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await update($, memory, () => toMemory(e.context))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Draw beneath whatever other bands (task-steps) drew, so they stack.
    const above = await next(e)
    if (e.props.hasSurvey) {
      return above
    }

    const { Box, Text } = $.ui.resolve(e)
    const value = await read($, memory)

    if (value === null) {
      return (
        <Box flexDirection="column">
          {above}
          <Box>
            <Text color={ACCENT}>{'○ '}</Text>
            <Text dimColor>{`${'─'.repeat(WIDTH)}  memory`}</Text>
          </Box>
        </Box>
      )
    }

    const { filled, empty } = bar(value.percent)
    const tone = value.percent >= 85 ? CRIMSON : value.percent >= 60 ? AMBER : ACCENT

    return (
      <Box flexDirection="column">
        {above}
        <Box>
          <Text color={tone}>{`${icon(value.percent)} `}</Text>
          <Text color={tone}>{filled}</Text>
          <Text dimColor>{empty}</Text>
          <Text color={tone} bold>{`  ${value.percent}%`}</Text>
          <Text dimColor>{`  ${compact(value.tokens)}/${compact(value.window)}`}</Text>
          {value.percent >= 85 ? <Text dimColor>{'  · /compact'}</Text> : null}
        </Box>
      </Box>
    )
  })
}

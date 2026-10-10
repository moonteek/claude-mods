import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Limit, Memory } from '../types'

const WIDTH = 20
const LABEL = 9
const ACCENT = '#D97757'
const AMBER = '#E2A84B'
const CRIMSON = '#E5484D'
const memory = atom({ plugin: 'memory-bar', key: 'memory' } as const, null)
const limits = atom({ plugin: 'memory-bar', key: 'limits' } as const, [])

const toMemory = (context: SessionContextUsage): Memory | null =>
  context.tokens === undefined
    ? null
    : {
        tokens: context.tokens,
        window: context.window,
        percent: context.percent ?? Math.round((context.tokens / context.window) * 100),
      }

const toLimits = (rateLimits: readonly SessionRateLimit[]): Limit[] =>
  rateLimits.map(limit => ({ kind: limit.kind, percent: limit.percentUsed, resetsAt: limit.resetsAt }))

const NAMES: Record<string, string> = { five_hour: '5-hour', seven_day: 'weekly', spend_limit: 'spend' }

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

// "2h 14m", "4d 3h", "12m"
const until = (resetsAt: string | undefined, now: number) => {
  const at = resetsAt === undefined ? NaN : Date.parse(resetsAt)
  if (Number.isNaN(at)) return ''
  const minutes = Math.max(0, Math.round((at - now) / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const text = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
  return `resets in ${text}`
}

// The icon fills like a gauge: ○ ◔ ◑ ◕ ●
const icon = (percent: number) => '○◔◑◕●'[Math.max(0, Math.min(4, Math.floor(percent / 20)))]
const toneOf = (percent: number) => (percent >= 85 ? CRIMSON : percent >= 60 ? AMBER : ACCENT)

export const bar = (percent: number) => {
  const filled = Math.max(0, Math.min(WIDTH, Math.round((percent / 100) * WIDTH)))
  return { filled: '━'.repeat(filled), empty: '─'.repeat(WIDTH - filled) }
}

// Rate limits are the account's, but a session only learns them from its first reply. The latest
// reading goes in the cross-session store, so every session shows it from the start and picks up
// readings other sessions made.
const READING = 'rateLimits'
type Reading = { at: number; limits: Limit[] }

async function saveReading($: EngineInterface, list: Limit[]) {
  if (list.length > 0) {
    const reading: Reading = { at: await $.clock.now(), limits: list }
    await $.store.set(READING, reading)
  }
}

async function loadReading($: EngineInterface) {
  const reading = (await $.store.get(READING)) as Reading | undefined
  if (reading !== undefined && reading.limits.length > 0) {
    await update($, limits, () => reading.limits)
  }
}

async function tick($: EngineInterface) {
  await loadReading($)
  // Keep the reset countdowns current while the session sits idle.
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const usage = await $.session.usage()
    await update($, memory, () => toMemory(usage.context))
    const live = toLimits(usage.rateLimits)
    if (live.length > 0) {
      await update($, limits, () => live)
      await saveReading($, live)
    } else {
      await loadReading($)
    }
    $.clock.every(60_000, () => tick($))
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await update($, memory, () => toMemory(e.context))
    }
    if (e.changed.includes('rateLimits')) {
      const live = toLimits(e.rateLimits)
      await update($, limits, () => live)
      await saveReading($, live)
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
    const windows = await read($, limits)
    const now = await $.clock.now()

    const row = (label: string, percent: number, detail: string, hint?: string) => {
      const { filled, empty } = bar(percent)
      const tone = toneOf(percent)
      return (
        <Box>
          <Text color={tone}>{`${icon(percent)} `}</Text>
          <Text dimColor>{label.padEnd(LABEL)}</Text>
          <Text color={tone}>{filled}</Text>
          <Text dimColor>{empty}</Text>
          <Text color={tone} bold>{`${Math.round(percent)}%`.padStart(6)}</Text>
          <Text dimColor>{detail === '' ? '' : `  ${detail}`}</Text>
          {hint === undefined ? null : <Text dimColor>{`  · ${hint}`}</Text>}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {above}
        {value === null ? (
          <Box>
            <Text color={ACCENT}>{'○ '}</Text>
            <Text dimColor>{`${'context'.padEnd(LABEL)}${'─'.repeat(WIDTH)}  waiting for first reply`}</Text>
          </Box>
        ) : (
          row(
            'context',
            value.percent,
            `${compact(value.tokens)}/${compact(value.window)}`,
            value.percent >= 85 ? '/compact' : undefined,
          )
        )}
        {windows.map(limit => {
          // A saved reading may outlive its window: past its reset, the window starts over empty.
          const isReset = limit.resetsAt !== undefined && Date.parse(limit.resetsAt) <= now
          return isReset
            ? row(NAMES[limit.kind] ?? limit.kind, 0, 'just reset')
            : row(NAMES[limit.kind] ?? limit.kind, limit.percent, until(limit.resetsAt, now))
        })}
      </Box>
    )
  })
}

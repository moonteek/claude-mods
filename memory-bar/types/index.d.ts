export type Memory = { tokens: number; window: number; percent: number }

declare module 'claude-code' {
  interface PluginState {
    'memory-bar': { memory: Memory | null }
  }
}

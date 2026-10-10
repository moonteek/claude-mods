export type Memory = { tokens: number; window: number; percent: number }
export type Limit = { kind: string; percent: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'memory-bar': { memory: Memory | null; limits: Limit[] }
  }
}

export type StepStatus = 'pending' | 'in_progress' | 'completed'
export type Step = { id: string; label: string; active: string; status: StepStatus }
export type Task = { title: string; steps: Step[] }

declare module 'claude-code' {
  interface PluginState {
    'task-steps': { task: Task | null; prompt: string }
  }
}

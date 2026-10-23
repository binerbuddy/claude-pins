export type Pin = { id: string; text: string; pinnedAt: number; isDone: boolean }

declare module 'claude-code' {
  interface PluginState {
    pins: { pins: Pin[] }
  }
}

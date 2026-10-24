// msgId: the transcript row the pin came from, for goto; absent when unknown.
export type Pin = { id: string; text: string; pinnedAt: number; isDone: boolean; msgId?: string }

declare module 'claude-code' {
  interface PluginState {
    pins: { pins: Pin[] }
  }
}

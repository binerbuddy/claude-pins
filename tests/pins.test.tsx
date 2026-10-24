import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import type { Pin } from '../types'

const REPLY = 'Before I continue:\n\n1. Which port?\n2. Keep the old config?'

// The engine beneath the plugin: an in-memory store, a fixed session id, a
// pane that always places, and the engine's own reply row as a plain Text.
function engine(on: On, store: Map<string, unknown>) {
  on('session.id', async () => ({ value: 'sess-1' }))
  on('store.get', async (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', async (_$, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('ui.render', { component: 'AssistantMessage' }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.text}</Text>
  })
}

function mountReply($: Engine, text = REPLY) {
  return $.ui.mount({
    plugin: 'pins',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'msg-1',
    props: { text, isFirstOfReply: true },
  })
}

function mountPane($: Engine) {
  return $.ui.mount({
    plugin: 'pins',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'pins',
    props: {
      title: 'Pins',
      isFocused: false,
      bodyColumns: 50,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 20 },
      view: {},
    },
  })
}

test('pinning a reply shows it in the pane and persists it', async ($, on) => {
  const store = new Map<string, unknown>()
  engine(on, store)

  const reply = await mountReply($)
  expect(await reply.find({ key: 'pin:msg-1', text: '📌 pin' })).toBeDefined()
  await reply.press({ key: 'pin:msg-1' })

  const pane = await mountPane($)
  expect(await pane.find({ type: 'Markdown', text: 'Which port?' })).toBeDefined()

  const saved = store.get('pins:sess-1') as Pin[]
  expect(saved.length).toBe(1)
  expect(saved[0]?.isDone).toBe(false)
})

test('done moves a pin to the done list; unpin removes it', async ($, on) => {
  const store = new Map<string, unknown>()
  engine(on, store)

  await (await mountReply($)).press({ key: 'pin:msg-1' })
  const pane = await mountPane($)

  await pane.press({ key: 'done:msg-1' })
  expect((store.get('pins:sess-1') as Pin[])[0]?.isDone).toBe(true)
  expect(await pane.find({ type: 'Markdown' })).toBeUndefined()
  expect(await pane.find({ text: /Done \(1\)/ })).toBeDefined()

  await pane.press({ key: 'unpin:msg-1' })
  expect(store.get('pins:sess-1')).toEqual([])
})

test('pinning the same reply twice keeps one pin', async ($, on) => {
  const store = new Map<string, unknown>()
  engine(on, store)

  const reply = await mountReply($)
  await reply.press({ key: 'pin:msg-1' })
  // Pressing again on a pinned reply unpins it.
  await reply.press({ key: 'pin:msg-1' })
  expect(store.get('pins:sess-1')).toEqual([])
})

test('the pane draws a table as a grid fitted to its width', async ($, on) => {
  const store = new Map<string, unknown>()
  engine(on, store)
  const text = [
    'Pick one:',
    '',
    '| Id | Request | Recommendation |',
    '|----|---------|----------------|',
    '| E1 | A long request that would never fit a fifty column pane on one line | **Do first.** |',
    '| E2 | Short | Yes |',
    '',
    'Short version: E1 first.',
  ].join('\n')
  const reply = await mountReply($, text)
  await reply.press({ key: 'pin:msg-1' })

  const pane = await mountPane($)
  const markdowns = (await pane.findAll({ type: 'Markdown' })).map(m => m.text)
  expect(markdowns).toContain('Pick one:')
  expect(markdowns).toContain('**Request**')
  expect(markdowns).toContain('**Do first.**')
  expect(markdowns).toContain('Short version: E1 first.')
  expect(markdowns.some(m => m?.includes('|'))).toBe(false)
})

test('a pin from the 📌 button has a goto; a failed scroll toasts', async ($, on) => {
  const store = new Map<string, unknown>()
  engine(on, store)
  const toasts: string[] = []
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  const reply = await mountReply($)
  await reply.press({ key: 'pin:msg-1' })
  const pane = await mountPane($)
  const id = ((await store.get('pins:sess-1')) as Pin[])[0]?.id
  expect(await pane.find({ key: `goto:${id}` })).toBeDefined()
  await pane.press({ key: `goto:${id}` })
  // The kit has no transcript to scroll, so the press ends in the toast.
  expect(toasts).toHaveLength(1)
})

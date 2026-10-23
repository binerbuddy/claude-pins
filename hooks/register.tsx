import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Pin } from '../types'

const PANE = 'pins'
const pins = atom({ plugin: 'pins', key: 'pins' } as const, [] as Pin[])

// Pins persist per session in $.store, so a restart or --resume brings them back.
async function storeKey($: EngineInterface): Promise<string> {
  return `pins:${await $.session.id()}`
}

async function change($: EngineInterface, fn: (list: Pin[]) => Pin[]): Promise<Pin[]> {
  await update($, pins, list => fn(list ?? []))
  const list = await read($, pins)
  await $.store.set(await storeKey($), list)
  return list
}

function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: 'Pins' })
}

async function addPin($: EngineInterface, id: string, text: string) {
  await change($, list =>
    list.some(p => p.id === id || p.text === text)
      ? list
      : [...list, { id, text, pinnedAt: Date.now(), isDone: false }],
  )
  await openPane($)
}

function firstLine(text: string): string {
  const line = text.split('\n').find(l => l.trim() !== '') ?? ''
  return line.length > 80 ? `${line.slice(0, 79)}…` : line
}

function age(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  return `${Math.floor(min / 60)}h`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pin',
      description: 'Pin the last assistant reply (or the Nth from last) to the Pins pane',
      argumentHint: '[n]',
    })
    await $.command.register({
      name: 'pins',
      description: 'Open the Pins pane; "/pins clear" removes done pins, "/pins clear all" removes all',
      argumentHint: '[clear [all]]',
    })

    const saved = (await $.store.get(await storeKey($))) as Pin[] | undefined
    if (saved?.length) {
      await update($, pins, () => saved)
      if (saved.some(p => !p.isDone)) void openPane($)
    }

    return next(e)
  })

  on('command.run', { command: 'pin' }, async ($, e) => {
    const n = Math.max(1, parseInt(e.args.trim() || '1', 10) || 1)
    const replies = (await $.session.messages()).filter(m => m.role === 'assistant' && m.text.trim() !== '')
    const reply = replies[replies.length - n]
    if (!reply) return { text: 'No assistant reply to pin.' }

    await addPin($, `cmd-${Date.now()}`, reply.text)
    return { text: `Pinned: ${firstLine(reply.text)}` }
  })

  on('command.run', { command: 'pins' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'clear all') {
      await change($, () => [])
      return { text: 'All pins removed.' }
    }
    if (args === 'clear') {
      await change($, list => list.filter(p => !p.isDone))
      return { text: 'Done pins removed.' }
    }

    await openPane($)
    return { text: 'Pins pane opened.' }
  })

  // A pin glyph over the top-right corner of each reply block, shown on hover.
  // Absolute, so revealing it moves nothing in the transcript.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const own = await next(e)
    if (e.props.isSummary || e.props.text.trim() === '') return own

    const { Box, Button } = $.ui.resolve(e)
    const id = e.requestId
    const isPinned = (await read($, pins)).some(p => p.id === id)
    const text = e.props.text

    return (
      <Box key={`pin-msg-${id}`} flexDirection="column">
        {own}
        <Box
          position="absolute"
          top={0}
          right={0}
          {...(isPinned ? {} : { display: 'none' as const, hover: { display: 'flex' as const } })}
        >
          <Button
            key={`pin:${id}`}
            plain
            dimColor
            label={isPinned ? '📌 unpin' : '📌 pin'}
            onPress={() =>
              isPinned ? void change($, list => list.filter(p => p.id !== id)) : void addPin($, id, text)
            }
          />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const list = await read($, pins)
    const open = list.filter(p => !p.isDone)
    const done = list.filter(p => p.isDone)

    const header = (pin: Pin) => (
      <Box flexDirection="row" gap={1}>
        <Button
          key={`done:${pin.id}`}
          plain
          label={pin.isDone ? '[x]' : '[ ]'}
          onPress={() =>
            void change($, l => l.map(p => (p.id === pin.id ? { ...p, isDone: !p.isDone } : p)))
          }
        />
        <Text dimColor>{age(pin.pinnedAt)}</Text>
        <Button
          key={`unpin:${pin.id}`}
          plain
          dimColor
          label="unpin"
          onPress={() => void change($, l => l.filter(p => p.id !== pin.id))}
        />
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        {list.length === 0 && (
          <Text dimColor>Nothing pinned. Hover a reply and press 📌, or run /pin.</Text>
        )}
        {open.map(pin => (
          <Box flexDirection="column">
            {header(pin)}
            <Markdown key={`md:${pin.id}`} text={pin.text} />
          </Box>
        ))}
        {done.length > 0 && (
          <Box flexDirection="column">
            <Box flexDirection="row" gap={1}>
              <Text dimColor>Done ({done.length})</Text>
              <Button
                key="clear-done"
                plain
                dimColor
                label="clear"
                onPress={() => void change($, l => l.filter(p => !p.isDone))}
              />
            </Box>
            {done.map(pin => (
              <Box flexDirection="row" gap={1}>
                {header(pin)}
                <Text dimColor>{firstLine(pin.text)}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}

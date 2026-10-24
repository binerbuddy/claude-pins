import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Pin } from '../types'

const PANE = 'pins'
const pins = atom({ plugin: 'pins', key: 'pins' } as const, [] as Pin[])
const isConfirmingClear = atom({ plugin: 'pins', key: 'isConfirmingClear' } as const, false)

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

// Reply blocks as drawn, by transcript row, so /pin can find the row it pins.
const drawn = new Map<string, string>()

function rowOf(text: string): string | undefined {
  let found: string | undefined
  for (const [id, block] of drawn) if (text.includes(block)) found = id
  return found
}

async function addPin($: EngineInterface, id: string, text: string, msgId: string | undefined) {
  await change($, list =>
    list.some(p => p.id === id || p.text === text)
      ? list
      : [...list, { id, text, pinnedAt: Date.now(), isDone: false, ...(msgId ? { msgId } : {}) }],
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

// Markdown sizes a table to the whole terminal, so in the narrower pane each
// row wraps into a mess. The pane draws tables itself, fitted to its width.
type Block = { kind: 'md'; text: string } | { kind: 'table'; head: string[]; rows: string[][] }

const DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

function cells(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  return s.split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'))
}

function blocks(text: string): Block[] {
  const lines = text.split('\n')
  const out: Block[] = []
  let md: string[] = []
  let inFence = false
  const flush = () => {
    if (md.join('').trim() !== '') out.push({ kind: 'md', text: md.join('\n').trim() })
    md = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    const next = lines[i + 1] ?? ''
    if (!inFence && line.includes('|') && next.includes('|') && DELIMITER.test(next)) {
      flush()
      const head = cells(line)
      const rows: string[][] = []
      for (i += 2; lines[i]?.includes('|') && lines[i]?.trim() !== ''; i++) {
        const row = cells(lines[i] ?? '')
        rows.push(head.map((_, j) => row[j] ?? ''))
      }
      i--
      out.push({ kind: 'table', head, rows })
      continue
    }
    md.push(line)
  }
  flush()
  return out
}

// Width a cell's text takes once its inline markdown is drawn.
function shownLength(cell: string): number {
  return cell.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*|__|`/g, '').length
}

// Natural widths when they fit; otherwise each column keeps a small minimum and
// the rest of the room goes out in proportion to how much more each wants.
function fitWidths(natural: number[], room: number): number[] {
  const total = natural.reduce((a, b) => a + b, 0)
  if (total <= room) return natural
  const base = natural.map(n => Math.min(n, 6))
  const left = Math.max(0, room - base.reduce((a, b) => a + b, 0))
  const wants = natural.map((n, i) => n - (base[i] ?? 0))
  const wantTotal = wants.reduce((a, b) => a + b, 0)
  if (wantTotal === 0) return base
  return base.map((b, i) => b + Math.floor((left * (wants[i] ?? 0)) / wantTotal))
}

// Pins made from the 📌 button before msgId existed carry the row as their id.
function msgIdOf(pin: Pin): string | undefined {
  return pin.msgId ?? (pin.id.startsWith('cmd-') ? undefined : pin.id)
}

async function gotoRow($: EngineInterface, msgId: string) {
  const deny = await $.ui
    .scroll({ to: { requestId: msgId }, block: 'start' })
    .then(r => r.deny, (err: unknown) => String(err))
  if (deny) await $.ui.toast(`Can't go to that reply: ${deny}`)
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

    await addPin($, `cmd-${Date.now()}`, reply.text, rowOf(reply.text.trim()))
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
    drawn.set(e.requestId, e.props.text.trim())

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
              isPinned ? void change($, list => list.filter(p => p.id !== id)) : void addPin($, id, text, id)
            }
          />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const list = await read($, pins)
    const isConfirming = await read($, isConfirmingClear)

    const GAP = 2
    const table = (head: string[], rows: string[][]) => {
      // The border and padding take 4 columns.
      const room = e.props.bodyColumns - 4 - GAP * (head.length - 1)
      const natural = head.map((h, j) => Math.max(1, ...[h, ...rows.map(r => r[j] ?? '')].map(shownLength)))
      const widths = fitWidths(natural, room)
      const rule = <Text dimColor>{'─'.repeat(widths.reduce((a, b) => a + b, 0) + GAP * (head.length - 1))}</Text>
      const row = (cols: string[], isHead: boolean) => (
        <Box flexDirection="row" columnGap={GAP}>
          {cols.map((c, j) => (
            <Box width={widths[j]}>
              <Markdown text={c === '' ? ' ' : isHead ? `**${c}**` : c} />
            </Box>
          ))}
        </Box>
      )
      return (
        <Box flexDirection="column" borderStyle="single" borderDimColor paddingX={1}>
          {row(head, true)}
          {rows.flatMap(r => [rule, row(r, false)])}
        </Box>
      )
    }

    const body = (text: string) => (
      <Box flexDirection="column">
        {blocks(text).map(b => (b.kind === 'md' ? <Markdown text={b.text} /> : table(b.head, b.rows)))}
      </Box>
    )
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
        {msgIdOf(pin) && (
          <Button
            key={`goto:${pin.id}`}
            plain
            dimColor
            label="goto"
            onPress={() => void gotoRow($, msgIdOf(pin) ?? '')}
          />
        )}
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
        {list.length > 0 && (
          <Box flexDirection="row" justifyContent="flex-end" gap={1}>
            {isConfirming ? (
              <>
                <Text dimColor>Clear all {list.length}?</Text>
                <Button
                  key="clear-all:yes"
                  plain
                  label="yes"
                  onPress={async () => {
                    await change($, () => [])
                    await update($, isConfirmingClear, () => false)
                  }}
                />
                <Button
                  key="clear-all:no"
                  plain
                  dimColor
                  label="no"
                  onPress={() => void update($, isConfirmingClear, () => false)}
                />
              </>
            ) : (
              <Button
                key="clear-all"
                plain
                dimColor
                label="clear all"
                onPress={() => void update($, isConfirmingClear, () => true)}
              />
            )}
          </Box>
        )}
        {open.map(pin => (
          <Box flexDirection="column">
            {header(pin)}
            {body(pin.text)}
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

# pins

A Claude Code plugin that pins assistant replies to a side pane, so a list of
questions the agent needs answered doesn't get buried as you work through it.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install pins --marketplace binerbuddy/claude-pins
```

Or from a shell:

```
claude plugin install pins --marketplace binerbuddy/claude-pins
```

## Use

- **📌 on a reply**: hover a reply and click the `📌 pin` in its top-right
  corner (fullscreen layout, which reports the mouse). A pinned reply keeps a
  visible `📌 unpin`.
- **`/pin [n]`**: pin the last reply, or the nth from last.
- **`/pins`**: open the Pins pane. `/pins clear` removes done pins,
  `/pins clear all` removes every pin.

In the pane each pin shows the full reply with `[ ]` to mark it done,
`goto` to scroll the transcript back to the original reply, and `unpin`.
`clear all` at the top removes every pin, after a yes/no. Done pins collapse to one line under "Done (n)".

Pins are kept per session: a restart or `--resume` brings them back, and the
pane reopens while any pin is still open.

In the fullscreen layout the pane docks beside the transcript from 110
columns; on the main screen it opens above the prompt.

## Codex

The same repo is a Codex plugin. Codex plugins can't draw panes, so it works
differently there:

- A `Stop` hook logs each reply.
- Send `$pins` to open the viewer in a herdr split beside the Codex pane
  (the prompt is caught by a hook, so no model turn is spent).
- In the viewer: enter pins or unpins, ctrl-d marks done, tab switches between
  pinned and all replies, esc closes. It updates as new replies arrive.

Install:

```
codex plugin marketplace add binerbuddy/claude-pins
codex plugin add pins@claude-pins
```

Approve the plugin's hooks when Codex asks. Needs herdr, fzf and jq; glow or
bat render the markdown if present. Outside herdr, run the viewer yourself:
`<plugin root>/codex/bin/pins view <session id>`.

There's no 📌 on replies and no goto in Codex: it has no extension point for
either.

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

## License

MIT

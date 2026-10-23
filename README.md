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

In the pane each pin shows the full reply with `[ ]` to mark it done and
`unpin`. Done pins collapse to one line under "Done (n)".

Pins are kept per session: a restart or `--resume` brings them back, and the
pane reopens while any pin is still open.

In the fullscreen layout the pane docks beside the transcript from 110
columns; on the main screen it opens above the prompt.

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

## License

MIT

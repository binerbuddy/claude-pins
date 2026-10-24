---
name: pins
description: Open the Pins viewer, a herdr split listing this session's replies to pin, mark done and reread. Use when the user says $pins, "open pins", "show my pins" or asks to pin a reply.
---

# Pins

Open the viewer by running exactly this command (it needs access outside the
workspace: the herdr socket and `~/.local/state/codex-pins`; ask to run it
unsandboxed if the sandbox blocks it):

```bash
"$(cat "${XDG_STATE_HOME:-$HOME/.local/state}/codex-pins/root")/codex/bin/pins" open
```

Then reply with the command's one-line result and nothing else. Do not read
or summarize the pins yourself; the user works them in the viewer:

- enter pins or unpins the highlighted reply, ctrl-d marks it done
- tab switches between pinned replies and all replies
- esc closes the viewer

If the command says no replies are logged yet, tell the user pins appear once
a turn has finished.

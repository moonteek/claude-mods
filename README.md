# claude-mods

Two small mods for Claude Code that draw above the prompt.

```
◇ Build a login page  ━━━━━──────────  1/3
  ✓ Set up routes
  ◉ Building the form…
  ○ Write tests
◑ ━━━━━━━━━──────────  45%  90k/200k
```

- **memory-bar**: how full Claude's context window (its working memory) is. The ○◔◑◕● icon fills with it; the bar turns amber at 60% and red at 85%, where it suggests `/compact`.
- **task-steps**: the steps Claude plans for a task, ticked off as it works. It reads Claude's to-do list (`TodoWrite` / `TaskCreate`) and also gives Claude a `steps` tool where those aren't available.

The two stack: the task checklist on top, the memory bar beneath.

## Install

In Claude Code:

```
/plugin install memory-bar --marketplace moonteek/claude-mods
/plugin install task-steps --marketplace moonteek/claude-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope loads them in every session).

## Develop

```
claude plugin validate memory-bar
claude plugin test memory-bar
```

# Master opencode — A 6-Week Learning Guide

Learn to drive opencode like an expert: context engineering, planning, delegation,
custom agents, skills, commands, and MCP — one level per week, ~1–2 hours each.

> **Target audience:** you. A JavaScript learner who built this todo-app with
> opencode (vanilla JS + Supabase + PWA, zero dependencies, tested + CI'd + deployed
> to GitHub Pages). The exercises in this guide use this repo as the practice ground.

---

## The one mental model

> **opencode is a junior developer on your team.** Its job is to write code fast.
> *Your* job is to give it context, set constraints, and **verify** everything it does.

A senior engineer never says "go build the whole thing" and walks away. Neither
should you. Every prompt is: **context → constraint → acceptance criteria → verify.**

---

## The mastery habits (practice these every week)

1. **Read every diff before accepting.** Scroll the changes. If you can't explain a
   change, ask the agent to explain it.
2. **Run the tests yourself.** `npm test` in this repo. Never trust "tests pass" —
   verify.
3. **Never auto-commit.** Review, then explicitly ask for the commit.
4. **Plan before building.** Anything nontrivial → Plan mode first (Tab key).
5. **Prompt recipe:** *context* (what/where) + *constraints* (what NOT to do,
   conventions) + *acceptance criteria* (how you'll know it's done).
6. **Keep a session log.** One line per session: what worked, what the prompt got
   wrong. Review it weekly — this is how you improve fastest.

---

## Level 1 — Core workflow

> **Goal:** drive a full feature through plan → build → verify without help.
> **Official docs:** https://opencode.ai/docs (Intro, TUI, Keybinds)

### The basics

| Thing | How |
|---|---|
| Start | `cd` into project → `opencode` |
| Create project rules | `/init` (analyzes the repo, writes `AGENTS.md`) |
| Plan mode | **Tab** (restricted: no edits/commands without asking) |
| Build mode | **Tab** again (full tools) |
| Reference files | `@` + fuzzy search, e.g. `@css/todo.css` |
| Add images | drag & drop into the terminal |
| Undo / redo | `/undo`, `/redo` (can run multiple times) |
| Share a session | `/share` (copies a link) |
| Help | `/help`, `opencode --help` |

### Prompt quality — Level 1 rules

Bad: `fix the mobile view`
Good:

```
The mobile view is breaking on the todo-app — the Add/Options row overflows
horizontally on a 375px viewport (it measured 424px). Find the cause in
@css/todo.css, fix it without changing desktop layout, and verify with
`node scripts/mobile-probe.js 375,812 http://localhost:8123/todo.html`.
Acceptance: zero overflow at 375px and 320px, npm test stays green.
```

Notice the four parts: context, location, constraint, verification + acceptance.

### Exercise (Week 1)

1. Run `/init` in this repo and read the generated `AGENTS.md` (Level 2 will tune it).
2. Pick a feature you already shipped (e.g. tag filtering). In **Plan mode**, prompt:
   "Explain how tag filtering works in @js/todo.js, then propose a plan to add a
   'filter by no tags' option. Don't change anything yet."
3. Read the plan. Switch to Build mode and say "proceed" — but first add the
   constraint: "keep the zero-dependency philosophy, no new files unless necessary."
4. Read the diff, run `npm test` yourself, then ask for the commit.

**Done when:** you can describe what Plan vs Build mode is for, and you reviewed a
full feature cycle with zero surprises.

---

## Level 2 — Context & rules

> **Goal:** the repo teaches opencode about itself, so new sessions don't need you
> to repeat yourself.
> **Official docs:** https://opencode.ai/docs/rules/

### AGENTS.md — the project's memory

`/init` creates it; the docs recommend **committing it**. It should contain what a
new agent session most needs:

- build / lint / test commands (`npm test` — runs phases 3–6, 96 checks)
- command order & verification steps (`npm test` before declaring done)
- architecture that's not obvious from filenames
- conventions & gotchas (zero-dependency rule, vm-sandbox tests, `scripts/mobile-probe.js`,
  SW version bump rule, Supabase RLS)

### Where rules live & precedence

1. Project `AGENTS.md` (root, committed)
2. Global `~/.config/opencode/AGENTS.md` (personal habits, applies everywhere)
3. Claude Code fallbacks (`CLAUDE.md`) — used only if no `AGENTS.md`

### Extra instruction files

`opencode.json` `instructions` field loads additional rule files — globs and remote
URLs supported:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["CONTRIBUTING.md", "docs/guidelines.md"]
}
```

### Exercise (Week 2)

1. `/init` on this repo (it improves in place — you already have it).
2. Hand-tune it: verify it lists `npm test`, the `test:phase2` manual-backend note,
   the zero-dependency rule, and `mobile-probe.js` usage.
3. Add one *personal* habit to `~/.config/opencode/AGENTS.md`, e.g. "Always show the
   diff summary before finishing; never run git push without asking."
4. Start a fresh session; confirm it already knows the repo without you explaining.

**Done when:** a brand-new opencode session on this repo needs zero introduction
from you.

---

## Level 3 — Delegation & custom agents

> **Goal:** hand work to specialized agents and control what they can do.
> **Official docs:** https://opencode.ai/docs/agents/, https://opencode.ai/docs/permissions/

### Built-in subagents (invoke with `@`)

| Agent | What it's for |
|---|---|
| `@explore` | Fast, read-only codebase search ("where is X handled?") |
| `@general` | Multi-step research/execution; runs in parallel |
| `@scout` | External docs / dependency research, clones repos into a cache |

Subagent work happens in child sessions — navigate with the session keys
(`Leader+Down` into child, `Left/Right` to cycle, `Up` back to parent).

### Custom agents

Markdown files in `.opencode/agents/` (project) or `~/.config/opencode/agents/`
(global). Filename = agent name. Or use `opencode agent create` (interactive wizard).

```markdown
---
description: Reviews code for quality and best practices
mode: subagent
model: anthropic/claude-haiku-4-20250514
temperature: 0.1
permission:
  edit: deny
  bash: deny
---
You are in code review mode. Focus on:
- Code quality and best practices
- Potential bugs and edge cases
- Performance implications
- Security considerations
Give constructive feedback without making direct changes.
```

### Permissions — your safety dial

Every tool can be `ask` / `allow` / `deny` (in `opencode.json` `permission` or agent
frontmatter). Bash accepts glob rules — last match wins:

```json
"bash": { "*": "ask", "git status *": "allow", "git log*": "allow" }
```

### Exercise (Week 3)

1. Create `code-reviewer` (read-only, low temperature) and `debug` (bash + read,
   no edit) agents in `.opencode/agents/`.
2. Run `@code-reviewer` on a real file (try `js/todo.js`) and read its findings.
3. Add a bash permission rule: `git push` → `ask` (put `"*": "allow"` first, then
   `"git push": "ask"` last).

**Done when:** you can hand work to `@explore`/`@general` deliberately, and your
custom agents show up in the `@` menu.

---

## Level 4 — Skills & custom commands

> **Goal:** package repeatable knowledge into one-word invocations.
> **Official docs:** https://opencode.ai/docs/skills/, https://opencode.ai/docs/commands/

### Skills — reusable instruction bundles

One folder per skill with a `SKILL.md` (must be ALL-CAPS filename):

```
.opencode/skills/mobile-qa/SKILL.md
```

```markdown
---
name: mobile-qa
description: Verify the todo-app's mobile layout with the CDP probe and phase-6 contract test
---
## What I do
1. Run `node scripts/mobile-probe.js 375,812 http://localhost:8123/todo.html`
   and `node scripts/mobile-probe.js 320,640 ...`
2. Run `node test/test-phase6.js`
3. Report overflow, touch targets < 44px, console errors, and test failures
## When to use me
Any time a CSS or layout change could affect phones or tablets.
```

Skills load on demand via the `skill` tool; control access with `permission.skill`
patterns (`"mobile-*": "allow"`).

### Custom commands — slash shortcuts

`.opencode/commands/*.md` (project) or `~/.config/opencode/commands/` (global):

```markdown
---
description: Run the full test suite and report failures
---
Run `npm test` and show any failures. Focus on the failing tests and suggest fixes.
```

Template power features:

| Feature | Syntax |
|---|---|
| Arguments | `$ARGUMENTS`, `$1`, `$2`, … |
| Shell output | ``!`npm test` `` injects command output into the prompt |
| File content | `@src/file.js` includes the file |

### Exercise (Week 4)

1. Create the `mobile-qa` skill above (works even with the local server on :8123 —
   the probe takes a URL argument, so document `http://localhost:8123/todo.html`).
2. Create `/test` and `/review-changes` commands. For review-changes use
   `` !`git log --oneline -10` `` and `@` your latest diff.
3. Run `mobile-qa` after a trivial CSS tweak (then revert it) to see the skill fire.

**Done when:** mobile QA is a one-sentence request, and `/test` is muscle memory.

---

## Level 5 — Power tools

> **Goal:** extend opencode's world — external tools, model choice, environment.
> **Official docs:** https://opencode.ai/docs/mcp-servers/, https://opencode.ai/docs/models/,
> https://opencode.ai/docs/zen/, https://opencode.ai/docs/ (Web, IDE, CLI, Themes, Keybinds)

### MCP servers — plug in external tools

Local (spawned via a command) or remote (URL + optional OAuth). Example — Context7
(docs search):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "context7": { "type": "remote", "url": "https://mcp.context7.com/mcp" }
  }
}
```

Then just say `use context7` in a prompt.

> ⚠️ **Context cost:** every MCP server adds tools to the context. Enable only what
> you need — disable servers with `"enabled": false` rather than deleting configs.

Manage auth: `opencode mcp list`, `opencode mcp auth <server>`, `opencode mcp debug <server>`.

### Models

- `opencode models` lists available models; `/models` switches in-session.
- OpenCode Zen (`/connect`) is the curated, pre-tested provider — easiest way to pay
  per-use without juggling API keys.
- Per-agent model overrides let you spend cheap on planning and strong on building:

```json
"agent": { "plan": { "model": "opencode/gpt-5.1-mini" } }
```

Model ID format: `provider/model-id` (e.g. `opencode/gpt-5.1-codex`).

### Environment

- **Keybinds/themes**: `opencode.json` (`keybind`, `theme`) or per-session commands.
- **Formatters**: auto-format on save (see docs/formatters).
- **Web + IDE + CLI modes**: the same sessions everywhere — `opencode web`, IDE
  extension, and CLI (`opencode run "prompt"`, headless for scripting).
- **Sessions**: long chats get compacted automatically (a hidden system agent
  summarizes). Start a fresh session per task; the session log (habit #6) is your
  continuity.

### Exercise (Week 5)

1. Add Context7; ask it: "use context7 — explain Supabase RLS policies for a todo
   app, and check our @sql/supabase-setup.sql for common mistakes."
2. Try `/models`; note how switching models changes response style on a simple ask.
3. Try the CLI once: `opencode run "summarize this repo"`.

**Done when:** you can deliberately choose a model and an external tool for a task,
and you know what "context bloat" feels like.

---

## Level 6 — The capstone

> **Goal:** one full project cycle using everything learned, with zero hand-holding.

**Project (framework decision deferred):** migrate or rebuild a project end-to-end.
Candidates:
- Migrate this todo-app to a modern stack (Vite + React or Vue — decide later),
  keeping Supabase as the backend
- Or build a brand-new small app (e.g. a Kanban board) from scratch

**Run it like a professional:**

1. `/init` + hand-tuned `AGENTS.md` first
2. Plan mode → full plan → review → iterate (Levels 1–2)
3. Break it into phases; run `@explore` for unknowns, `@general` for parallel work (3)
4. Package your QA as a skill, your test runs as a command (4)
5. Use Context7 for library docs, pick models deliberately (5)
6. Verify every step yourself: diff review + tests + probe + deploy
7. Commit at each milestone; keep the session log

**Done when:** you ship something new (or a migrated app), and your session log shows
you caught mistakes the agent made — that's what mastery looks like.

---

## The 6-week calendar (relaxed pace, 1–2h/week)

| Week | Level | Session plan (≈90 min) |
|---|---|---|
| 1 | Core workflow | 30m basics → 45m plan/build exercise → 15m log |
| 2 | Context & rules | 30m `/init` → 30m tune AGENTS.md → 30m fresh-session test |
| 3 | Delegation & agents | 30m read agents docs → 45m build 2 agents → 15m permissions |
| 4 | Skills & commands | 30m write skill → 30m write commands → 30m run them |
| 5 | Power tools | 30m Context7 → 30m models → 30m CLI/web |
| 6 | Capstone | plan the project; execute over following weeks |

---

## Quick-reference cheat sheet

### Keybinds
| Action | Key |
|---|---|
| Switch primary agent (Plan/Build) | `Tab` |
| Enter subagent child session | `Leader+Down` |
| Cycle child sessions | `Right` / `Left` |
| Back to parent session | `Up` |

### Commands
| Command | Purpose |
|---|---|
| `/init` | Create/improve `AGENTS.md` |
| `/undo` `/redo` | Step back/forward through changes |
| `/share` | Share current session as a link |
| `/models` | Switch model mid-session |
| `/connect` | Configure a provider (Zen) |
| `/help` | Help |

### File locations
| What | Where |
|---|---|
| Project rules | `AGENTS.md` (commit it) |
| Global rules | `~/.config/opencode/AGENTS.md` |
| Custom agents | `.opencode/agents/*.md` or `~/.config/opencode/agents/` |
| Skills | `.opencode/skills/<name>/SKILL.md` |
| Commands | `.opencode/commands/*.md` |
| Config | `opencode.json` (project) / `~/.config/opencode/opencode.json` (global) |

### Prompt recipe
> **Context** (what/where, references via `@`) → **Constraints** (what not to do,
> conventions) → **Acceptance criteria** (how to verify) → **Verify yourself.**

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Agent seems to forget earlier context | Long session → compaction kicked in. Start a fresh session; lean on `AGENTS.md` + the session log |
| Model makes sloppy edits | Read the diff; use `/undo`; lower `temperature` on your build agent |
| Too much back-and-forth on permissions | Tighten bash glob rules (`"*": "ask"`, then allow the safe reads) — or loosen if you trust the task |
| MCP bloat / slow responses | Disable unused MCP servers (`"enabled": false`); each server costs context tokens |
| Windows / git-bash quirks | Prefer WSL for best performance; quote paths with spaces; use `taskkill //PID <pid> //F` for stray processes (see this repo's `scripts/mobile-probe.js` history) |
| Agent asks too many questions | You gave too little context. Use `@` references and be specific about constraints |
| Agent goes off-script | That's a sign to strengthen `AGENTS.md` — write the convention down so it's enforced next time |

---

## Final word

Mastery of opencode is 20% knowing the features and 80% **judgment**:

- knowing when to plan vs. build
- knowing what context matters
- knowing how to verify without trusting

The tool changes fast (docs: https://opencode.ai/docs). When a feature sounds wrong
or new, check the docs first — and keep your session log honest. Six weeks from now,
the agent will feel like a different tool in your hands.
# My Tasks — Todo App

A fast, installable todo app with realtime sync, offline support, and a zero-dependency vanilla JS codebase.

![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen) ![Tests](https://img.shields.io/github/actions/workflow/status/MeinHuMahesh/todo-app/ci.yml)

**Live demo:** https://meinhuMahesh.github.io/todo-app/

---

## Features

- **Tasks done right** — text, completion, due dates, priority (low/medium/high), tags, subtasks, and notes on every task
- **Realtime sync** — changes appear instantly across all your devices via Supabase Realtime
- **Offline-first PWA** — installable on any phone/desktop; works fully offline with an IndexedDB sync queue that flushes when you're back online (nothing lost on reload)
- **Find anything fast** — search by text or tag, filters (all / active / completed / today / overdue), tag filter bar, and sort by manual order, due date, priority, or newest
- **Reorder however you like** — drag-and-drop on desktop, ↑/↓ move buttons on touch devices
- **Undo delete** — every delete is toast-undoable for 5 seconds; only then is it truly gone
- **Accounts** — email/password sign-up and sign-in, or jump in as an anonymous guest
- **Dark & light themes** — manual toggle, persisted preference, and system-color detection
- **Accessible** — skip link, ARIA throughout, full keyboard navigation, `prefers-reduced-motion` support, 44px+ touch targets
- **Mobile-first** — responsive down to 320px, safe-area aware, no iOS input zoom

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vanilla JS (ES6+, no build step) | Zero installs, simple to deploy, easy to read |
| Backend | Supabase (Postgres) | Auth, Row-Level Security, and Realtime out of the box |
| Offline | Service Worker + IndexedDB | Custom sync queue with conflict-safe `deletedIds` tracking |
| Hosting | GitHub Pages (+ Netlify config included) | Free, static, CI-deployed |
| Tests | Plain-Node vm-sandbox suites | No frameworks, no installs, runs anywhere Node does |

## Getting started

### 1. Run it locally

No installs needed — the app runs from any static server:

```bash
# Option A: Python
python -m http.server 8080

# Option B: Node (no deps)
npx --yes serve .

# Option C: npm script (defined in package.json)
npm run serve
```

Open http://localhost:8080. Without Supabase configured, the app runs in
**local-only mode** (tasks persist in the browser, no account needed).

### 2. Set up the backend (optional, for realtime sync)

1. Create a free project at [supabase.com](https://supabase.com)
2. Open **Project Settings → API** and copy the **Project URL** and **publishable key**
3. Run `sql/supabase-setup.sql` once in the SQL Editor (creates the `todos` table,
   enables Row-Level Security, and turns on Realtime)
4. Put your values in `js/supabase.config.js`:

```js
const SUPABASE_CONFIG = {
    url: 'https://your-project.supabase.co',
    publishableKey: 'sb_publishable_your-key'
};
```

That's it — sign-up, sign-in, or continue as guest, and your tasks sync everywhere.

## Testing

The project keeps the zero-dependency promise in its tests too — plain Node scripts
(no framework), 96 checks across 4 suites:

```bash
npm test
```

| Suite | Covers |
|---|---|
| `test/test-phase3.js` | Sorting, filters, search, drag/move reorder logic (17) |
| `test/test-phase4.js` | Offline queue, IndexedDB persistence, delete/undo flush (19) |
| `test/test-phase5.js` | Theme resolution, toast + undo delete behavior (23) |
| `test/test-phase6.js` | Mobile/responsiveness CSS + HTML contract (37) |

`test/test-phase2.js` requires a live Supabase backend and runs separately
(`npm run test:phase2`). GitHub Actions runs the full suite on every push/PR.

There's also a browser-level mobile probe for real layout checks:

```bash
node scripts/mobile-probe.js 375,812 http://localhost:8080/todo.html
```

## Project structure

```
├── todo.html            App markup (works standalone)
├── index.html           GitHub Pages entry → redirects to todo.html
├── css/todo.css         Mobile-first glassmorphism UI
├── js/
│   ├── todo.js          State, auth, sync, render, all interactions
│   ├── offline-store.js IndexedDB offline queue
│   ├── supabase-sdk.js  Local copy of the Supabase SDK (no CDN)
│   └── supabase.config.js / supabase.env.js  Credentials (env overrides)
├── sql/supabase-setup.sql  One-time backend setup
├── sw.js                Service worker (cache-first, versioned)
├── manifest.json        PWA install manifest
├── icons/               PWA icons (192, 512, maskable)
├── test/                Node test suites (phases 2–6)
├── scripts/             Dev tools (mobile probe, one-time refactors)
├── .github/workflows/ci.yml  CI on every push
└── netlify.toml         Netlify deploy config (alternative hosting)
```

## Deployment

The site is hosted on **GitHub Pages** — every push to `main` runs CI, then
auto-deploys:

```
https://meinhuMahesh.github.io/todo-app/
```

Netlify is also pre-configured (`netlify.toml` + `_redirects`), which adds clean
redirects, immutable icon caching, and no-cache rules for `sw.js`/`manifest.json`.

> **Note:** after any change to app files, bump the `VERSION` constant in `sw.js`
> so installed clients refresh their caches.

## Docs

- `ROADMAP.md` — full build log: architecture decisions, phases, and tradeoffs
- `GUIDE-opencode.md` — a 6-week plan for mastering the opencode AI coding agent
  (this project was built with it)

## License

Private project — all rights reserved.
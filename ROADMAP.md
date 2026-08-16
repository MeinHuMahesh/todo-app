# Todo App — Development Roadmap

A vanilla HTML/CSS/JS todo app with data from [JSONPlaceholder](https://jsonplaceholder.typicode.com/todos) and localStorage persistence. This document tracks all planned development phases.

**Status legend:** ✅ Done | 🚧 In progress | ⬜ Planned

---

## Phase 1 — Data model upgrade (foundation) ✅

Extend the todo model so later phases (dates, priorities, drag-drop, etc.) have somewhere to live.

**Todo object shape:**

```js
{
  id, text, completed,
  dueDate,          // ISO date string or null
  priority,         // 'low' | 'medium' | 'high'
  tags[],           // up to 6 tags
  subtasks[],       // { id, text, completed }
  notes,            // free text
  position,         // drag order (int, lower = higher)
  createdAt, updatedAt
}
```

**Delivered:**
- Versioned localStorage key `todo-app-state-v2` with automatic migration from the legacy `todo-app-state` key
- Rendering sorted by `position`; new tasks land at the top
- Collapsible add-task options panel: priority picker, due-date input, tags input
- Task rows are expandable to reveal subtasks (add/toggle/delete) and a notes textarea
- Due-date badges: overdue (red), today (amber), future (subtle)
- Priority glow dots, tag chips, subtask progress counter
- Edit-in-place: double-click a task title to rename (Enter saves, Esc cancels)

---

## Phase 2 — Supabase backend + auth ✅

Real accounts and cross-device sync.

**Delivered:**
- `todos` table schema with all Phase 1 fields + `user_id` (see `supabase-setup.sql`)
- Row-Level Security: users can only see/modify their own todos
- Supabase JS client (v2, loaded via CDN — no build step) replacing direct localStorage writes
- Auth screen: email/password sign-in, account creation, and "Continue as guest" (anonymous sign-in)
- Realtime subscription (`postgres_changes`) — edits made on another device appear live
- Offline fallback: localStorage mirror keeps working offline; writes queue up and sync automatically on reconnect
- On first login, existing local todos are pushed up to the server so nothing is lost
- User row in the header (email + sign out)

**How to enable (optional):**
1. Create a free project at https://supabase.com
2. Copy your **Project URL** and **publishable key** (the new name for the anon/public key) into `supabase.config.js`
3. Run `supabase-setup.sql` once in the Supabase SQL Editor (this also adds `todos` to the realtime publication for live sync)
4. Until configured, the app runs in local-only mode exactly as before

---

## Phase 3 — Feature rollout ✅

Builds on the Phase 1 UI.

**Delivered:**
- **Due dates & priorities**: priority picker on add, sort dropdown (Manual / Due date / Priority / Newest), "Today" and "Overdue" smart filters
- **Tags & categories**: tag suggestions while typing (datalist of existing tags), click any tag chip to filter, active-filter bar with clear button
- **Drag-and-drop reorder**: native HTML5 drag-and-drop (no library) — drag any task to reposition, order persists to Supabase; dragging auto-switches to Manual sort
- **Subtasks & notes**: expandable task detail panel with checklist + notes field (from Phase 1)
- **Search & keyboard shortcuts**: instant search across title and tags; shortcuts — `n` new task, `/` focus search, `Delete`/`Backspace` delete selected task (click a task to select it)
- Fixed a timezone bug in due-date handling (dates were parsed as UTC, breaking "today" badges outside UTC timezones)

**Files touched:** `todo.html` (toolbar, filters, tag bar, datalist), `css/todo.css` (toolbar, drag/selection states, chip interactions), `js/todo.js` (view logic, DnD, shortcuts)
**Tests:** `test/test-phase3.js` — 11 checks for filtering/sorting/search (run `node test/test-phase3.js`)

> Note: HTML5 drag-and-drop works on desktop; touch drag is not supported natively — consider SortableJS only if mobile reordering becomes a requirement.

---

## Phase 4 — PWA & offline ✅

**Delivered:**
- `manifest.json` + generated icons (`scripts/gen-icons.js` renders them — no image tools needed)
- `sw.js` service worker: precaches the app shell (cache-first for static assets, network-first for page loads with offline fallback, stale-while-revalidate for the demo-data API, and Supabase/auth traffic stays network-only)
- IndexedDB write queue (`js/offline-store.js`): offline changes are snapshotted and survive full page reloads
- Deletes are tracked too (`deletedIds`) — offline deletes flush correctly instead of resurrecting rows
- Queue auto-flushes on the `online` event and on every app start; offline deletes always win over stale rows (a pending queue takes priority over live pushes, so pending deletes can't be lost)
- Installable — open the app over http(s)/localhost, use the browser's "Install" option

> Note: service workers require https (or localhost) — `file://` won't register, but the app still works there with localStorage-only persistence.

**Tests:** `test/test-phase4.js` — 18 checks for the offline queue (run `node test/test-phase4.js`)

---

## Phase 5 — Polish, testing, deployment ✅

**Delivered:**
- **Dark/light theme**: all colors moved to CSS variables; light theme overrides them. Toggle button in the header (☀️/🌙), saved preference (`todo-app-theme`), system `prefers-color-scheme` respected when no preference is saved, dynamic `theme-color` meta
- **Toast notifications + undo delete**: deletes and "clear completed" are soft-deleted into an undo trash for 5s; the toast's Undo button restores them; only after the window expires does the real backend delete fire (online direct, offline via the `deletedIds` sync queue — nothing is lost on reload)
- **Accessibility pass**: skip link, ARIA labels/roles everywhere (dialog, aria-pressed on filters/priority, aria-expanded on detail buttons, aria-live on counters and toasts), tag chips converted from spans to real buttons, tasks focusable with arrow-key navigation + Enter to select, Escape clears selection, `:focus-visible` outlines, `prefers-reduced-motion` support, auth dialog focuses the email field
- **Tests**: `test/test-phase5.js` — 23 checks for theme + toast/undo (run `node test/test-phase5.js`); `package.json` with `npm test` (runs phase 3/4/5 — phase 2 needs a live backend so it stays separate)
- **CI**: `.github/workflows/ci.yml` — syntax checks, all unit tests, shell-asset and manifest smoke checks on every push/PR
- **Deployment**: `netlify.toml` + `_redirects` (root → `todo.html`, no-cache for `sw.js`/`manifest.json`, immutable icons); `js/supabase.env.js` allows per-site credential overrides generated from host env vars (falls back to committed values)

> Test framework note: kept plain-Node vm-sandbox tests instead of Vitest/Playwright — zero dependencies matches the project's philosophy and runs anywhere Node does. Phase 2's backend test (`test-phase2.js`) stays manual because it needs a live Supabase project.

**Files touched:** `todo.html`, `css/todo.css` (theme variables, toasts, focus/reduced-motion, chip buttons), `js/todo.js` (theme, toasts/undo, a11y), `scripts/refactor-css.js` (one-time color-variable conversion), `test/test-phase3.js`, `test/test-phase4.js` (updated for the undo flow)

---

## Phase 6 — Mobile-first styling & performance ✅

**Delivered:**
- **Mobile-first restructure**: base styles = phone (body `16px 12px`, card `24px 20px`, title 26px), `min-width: 768px` queries layer desktop on top (`48px 16px` body, `32px 28px` card, 32px title, compact inputs)
- **Touch UX**: all text inputs 16px base (kills iOS auto-zoom on focus), 44px+ hit targets for icon/utility buttons at base (compact on fine pointers), `touch-action: manipulation` + transparent tap highlight
- **Safe areas**: `env(safe-area-inset-*)` on body and toast, `viewport-fit=cover` meta, `100dvh` for mobile browser chrome
- **Hover hygiene**: all hover-only effects moved behind `@media (hover: hover) and (pointer: fine)` (no stuck hover states on touch)
- **Touch reorder**: ↑/↓ move buttons on each task, visible only on coarse pointers, wired into `reorderTodo()` — fills the HTML5 DnD gap on mobile
- **Performance**: removed `background-attachment: fixed` (iOS repaint bug), backdrop blur 20px → 12px on small screens, `render()` now builds a `DocumentFragment` + single `replaceChildren()` (one reflow instead of per-item appends)
- SW version bumped to `todo-v3` to refresh cached assets

**Files touched:** `todo.html` (viewport meta), `css/todo.css` (mobile-first restructure, media queries, touch targets), `js/todo.js` (reorder buttons, fragment render), `sw.js` (cache bump)
**Tests:** existing suites unchanged, plus 6 new `moveTodo` checks in `test-phase3.js` — `npm test` (59 checks) stays green

---

## Phase 7 — Ideas (not yet scoped) ⬜

- Recurring tasks, reminders/notifications
- Board/kanban view, calendar view
- Mobile app via Capacitor

---

## Key decisions & tradeoffs

| Decision | Choice | Why |
|---|---|---|
| Tech stack | Vanilla JS (no build step) | Simple to deploy, easy to learn, zero dependencies |
| Backend | Supabase over Firebase | Postgres, free realtime, built-in auth + RLS |
| Drag-and-drop | Native HTML5 first | Keeps the zero-dependency promise; SortableJS only as fallback |
| Testing | Plain-Node vm-sandbox tests (no framework) | Zero installs, runs anywhere Node does; keeps CI trivial |

## File map

| File | Role |
|---|---|
| `todo.html` | App markup (container, add panel, filters, list, footer, auth overlay) |
| `css/todo.css` | Glassmorphism UI, animations, badges, chips, detail panel, auth styles |
| `js/todo.js` | State, API fetch, migration, auth, sync/realtime, render + all interactions |
| `js/supabase.config.js` | Supabase project URL + publishable key (env-var overrides via `js/supabase.env.js`, then committed fallback) |
| `js/supabase.env.js` | Per-deployment credential overrides (generated from host env vars) |
| `js/supabase-sdk.js` | Local copy of the Supabase SDK (no CDN needed) |
| `sql/supabase-setup.sql` | One-time schema + RLS setup for Supabase |
| `manifest.json` | PWA manifest — installable, standalone, icons, theme colors |
| `sw.js` | Service worker — precaches the shell, offline page fallback, stale-while-revalidate for demo data |
| `js/offline-store.js` | IndexedDB-backed offline write queue (survives reloads) |
| `scripts/gen-icons.js` | Generates the PWA PNG icons (pure Node, no dependencies) |
| `scripts/refactor-css.js` | One-time CSS color → variable conversion (kept for reference) |
| `icons/` | Generated icons: `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` |
| `test/test-phase2.js` | Phase 2 backend integration test — run with `node test/test-phase2.js` |
| `test/test-phase3.js` | Phase 3 view-logic test — run with `node test/test-phase3.js` |
| `test/test-phase4.js` | Phase 4 offline-queue test — run with `node test/test-phase4.js` |
| `test/test-phase5.js` | Phase 5 theme + toast/undo test — run with `node test/test-phase5.js` |
| `package.json` | `npm test` runs phases 3–5; `npm run serve` starts a local static server |
| `.github/workflows/ci.yml` | CI: syntax + unit tests + asset smoke checks on push/PR |
| `netlify.toml`, `_redirects` | Netlify deploy config: root redirect, cache headers |
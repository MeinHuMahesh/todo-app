// Phase 5 test (no network, no UI): theme resolution/toggle persistence and
// toast + undo-delete behavior against the real todo.js functions.
// Run:  node test/test-phase5.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SUNDAY = '\u2600\uFE0F';
const MOON = '\uD83C\uDF19';
const mediaListeners = [];
const localStorageData = {};
const toastArea = { children: [], appendChild(el) { this.children.push(el); } };
const themeBtn = {
    textContent: '', attrs: {}, listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    setAttribute(k, v) { this.attrs[k] = v; }
};
let metaContent = null;
const metaTheme = { setAttribute(k, v) { metaContent = v; } };

function stubEl() {
    return {
        children: [], listeners: {},
        addEventListener(type, fn) { this.listeners[type] = fn; },
        appendChild(child) { this.children.push(child); },
        setAttribute() {}, getAttribute() { return null; },
        focus() {}, select() {}, replaceWith() {}, remove() {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        style: {}, dataset: {},
        querySelector() { return stubEl(); },
        innerHTML: '', textContent: '', value: '', hidden: false, disabled: false, title: '', tabIndex: 0
    };
}

const sandbox = {
    console, setTimeout, clearTimeout,
    document: {
        documentElement: { dataset: {} },
        getElementById(id) {
            if (id === 'toast-area') return toastArea;
            if (id === 'theme-toggle') return themeBtn;
            return stubEl();
        },
        querySelector(sel) { return sel.includes('theme-color') ? metaTheme : null; },
        querySelectorAll: () => [],
        addEventListener() {},
        createElement: () => stubEl(),
        head: { appendChild() {} }
    },
    window: {
        supabaseSDK: Promise.resolve(false),
        addEventListener() {},
        supabase: null,
        matchMedia: () => ({ matches: true, addEventListener(type, fn) { mediaListeners.push(fn); } })
    },
    localStorage: {
        getItem: k => (k in localStorageData ? localStorageData[k] : null),
        setItem(k, v) { localStorageData[k] = v; },
        removeItem(k) { delete localStorageData[k]; }
    },
    navigator: { onLine: true },
    fetch: async () => ({ ok: true, json: async () => [] })
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase.config.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'todo.js'), 'utf8') + `
globalThis.__test = {
    get todos() { return todos; },
    set todos(v) { todos = v; },
    get trash() { return trash; },
    get deletedIds() { return deletedIds; },
    set deletedIds(v) { deletedIds = v; },
    get sb() { return sb; },
    set sb(v) { sb = v; },
    get session() { return session; },
    set session(v) { session = v; },
    get offlineQueue() { return offlineQueue; },
    applyTheme, getSavedTheme, getSystemTheme, initTheme,
    deleteTodo, undoTrash, finalizeTrash, persist, normalize
};
`, sandbox);

const S = sandbox.__test;

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('PASS - ' + name); }
    else { fail++; console.log('FAIL - ' + name + (extra ? ' :: ' + extra : '')); }
}

(async () => {
    await new Promise(r => setTimeout(r, 50));

    // --- Theme: system preference (dark) applied with no saved choice ---
    check('init applies system dark theme', sandbox.document.documentElement.dataset.theme === 'dark');
    check('meta theme-color set for dark', metaContent === '#4c1d95');
    check('toggle button shows sun in dark mode', themeBtn.textContent === SUNDAY);
    check('toggle aria-pressed reflects dark', themeBtn.attrs['aria-pressed'] === 'true');

    // --- Theme: toggle persists explicit choice ---
    themeBtn.listeners.click();
    check('toggle switches to light', sandbox.document.documentElement.dataset.theme === 'light');
    check('toggle persists light preference', localStorageData['todo-app-theme'] === 'light');
    check('meta theme-color updated for light', metaContent === '#6366f1');
    check('toggle button shows moon in light mode', themeBtn.textContent === MOON);
    check('toggle aria-pressed reflects light', themeBtn.attrs['aria-pressed'] === 'false');
    themeBtn.listeners.click();
    check('second toggle returns to dark', sandbox.document.documentElement.dataset.theme === 'dark');

    // --- Theme: saved preference wins, system changes ignored while saved ---
    localStorageData['todo-app-theme'] = 'light';
    S.initTheme();
    check('saved light preference wins', sandbox.document.documentElement.dataset.theme === 'light');
    mediaListeners.forEach(fn => fn({ matches: false }));
    check('system change ignored while preference saved', sandbox.document.documentElement.dataset.theme === 'light');
    delete localStorageData['todo-app-theme'];
    mediaListeners.forEach(fn => fn({ matches: false }));
    check('system change applied when no preference', sandbox.document.documentElement.dataset.theme === 'light');
    mediaListeners.forEach(fn => fn({ matches: true }));
    check('system change back to dark applied', sandbox.document.documentElement.dataset.theme === 'dark');

    // --- Undo delete: restore within the window ---
    S.todos = [S.normalize({ id: 1, text: 'A', position: 0 }), S.normalize({ id: 2, text: 'B', position: 1 })];
    S.trash.length = 0;
    S.deleteTodo(1);
    check('delete shows a toast', toastArea.children.length >= 1);
    const toast = toastArea.children[toastArea.children.length - 1];
    const undoBtn = toast.children[1];
    check('toast has undo action', !!undoBtn && !!undoBtn.listeners.click);
    undoBtn.listeners.click();
    check('undo restores the task', S.todos.some(t => t.id === 1));
    check('undo clears the trash entry', S.trash.length === 0);

    // --- Finalize: no undo, delete lands in offline queue ---
    S.sb = null; S.session = null;
    S.todos = [S.normalize({ id: 5, text: 'E', position: 0 })];
    S.deleteTodo(5);
    S.finalizeTrash(S.trash[0]);
    check('finalized delete removed from trash', S.trash.length === 0);
    check('local-only finalize does not queue ids', S.deletedIds.length === 0);

    // --- Finalize with backend offline -> deletedIds + queue ---
    const mockSb = { from() { throw new Error('never called'); } };
    S.sb = mockSb;
    S.session = { user: { id: 'u1' } };
    sandbox.navigator.onLine = false;
    S.todos = [S.normalize({ id: 9, text: 'I', position: 0 })];
    S.deletedIds = [];
    S.deleteTodo(9);
    S.finalizeTrash(S.trash[0]);
    check('offline finalize records deletedIds', S.deletedIds.join() === '9');
    check('offline finalize updates the sync queue', !!S.offlineQueue && S.offlineQueue.deletedIds.join() === '9');

    // --- Undo of already-finalized entry is a no-op ---
    S.trash.length = 0;
    S.undoTrash({ items: [S.normalize({ id: 42, text: 'x' })], timer: null });
    check('undo of unknown entry is no-op', S.todos.length === 0 && !S.todos.some(t => t.id === 42));

    console.log('\nResult: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
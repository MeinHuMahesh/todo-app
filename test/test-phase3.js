// Phase 3 view-logic test (no network, no UI): exercises filtering, sorting,
// tag filter and search against the real todo.js functions.
// Run:  node test/test-phase3.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function stubEl() {
    return {
        addEventListener() {}, appendChild() {}, focus() {}, select() {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        style: {}, dataset: {},
        querySelector() { return stubEl(); },
        innerHTML: '', textContent: '', value: '', hidden: false, disabled: false, title: ''
    };
}

const sandbox = {
    console, setTimeout, clearTimeout,
    document: {
        getElementById: () => stubEl(),
        querySelectorAll: () => [],
        addEventListener() {},
        createElement: () => stubEl(),
        head: { appendChild() {} }
    },
    window: {
        supabaseSDK: Promise.resolve(false),
        addEventListener() {},
        supabase: null
    },
    localStorage: {
        getItem: () => null,
        setItem() {},
        removeItem() {}
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
    get currentFilter() { return currentFilter; },
    set currentFilter(v) { currentFilter = v; },
    get tagFilter() { return tagFilter; },
    set tagFilter(v) { tagFilter = v; },
    get searchQuery() { return searchQuery; },
    set searchQuery(v) { searchQuery = v; },
    get sortMode() { return sortMode; },
    set sortMode(v) { sortMode = v; },
    getVisible
};
`, sandbox);

const S = sandbox.__test;

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('PASS - ' + name); }
    else { fail++; console.log('FAIL - ' + name + (extra ? ' :: ' + extra : '')); }
}

(async () => {
    const T = (over) => Object.assign({
        id: 0, text: '', completed: false, dueDate: null, priority: 'low',
        tags: [], subtasks: [], notes: '', position: 0, createdAt: 0, updatedAt: 0
    }, over);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const isoLocal = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

    S.todos = [
        T({ id: 1, text: 'Alpha', position: 2, priority: 'low', dueDate: isoLocal(tomorrow), tags: ['work'], createdAt: 100 }),
        T({ id: 2, text: 'Beta', position: 0, priority: 'high', dueDate: isoLocal(yesterday), tags: ['home'], createdAt: 300 }),
        T({ id: 3, text: 'Gamma', position: 1, priority: 'medium', dueDate: isoLocal(today), tags: ['work', 'urgent'], createdAt: 200 }),
        T({ id: 4, text: 'Delta', position: 3, priority: 'high', dueDate: null, tags: [], createdAt: 400, completed: true })
    ];

    S.currentFilter = 'all';
    S.tagFilter = null;
    S.searchQuery = '';
    S.sortMode = 'manual';
    check('manual sort by position', S.getVisible().map(t => t.id).join() === '2,3,1,4');

    S.sortMode = 'priority';
    check('priority sort (high first)', S.getVisible().map(t => t.id).join() === '2,4,3,1');

    S.sortMode = 'due';
    check('due sort (nulls last)', S.getVisible().map(t => t.id).join() === '2,3,1,4');

    S.sortMode = 'created';
    check('created sort (newest first)', S.getVisible().map(t => t.id).join() === '4,2,3,1');

    S.sortMode = 'manual';
    S.currentFilter = 'today';
    check('today filter', S.getVisible().map(t => t.id).join() === '3');

    S.currentFilter = 'overdue';
    check('overdue filter (excludes completed)', S.getVisible().map(t => t.id).join() === '2');

    S.currentFilter = 'completed';
    check('completed filter', S.getVisible().map(t => t.id).join() === '4');

    S.currentFilter = 'all';
    S.tagFilter = 'work';
    check('tag filter', S.getVisible().map(t => t.id).join() === '3,1');

    S.tagFilter = null;
    S.searchQuery = 'gamm';
    check('search by text', S.getVisible().map(t => t.id).join() === '3');

    S.searchQuery = 'urgent';
    check('search by tag', S.getVisible().map(t => t.id).join() === '3');

    S.searchQuery = 'zzz';
    check('search no match', S.getVisible().length === 0);

    console.log('\nResult: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
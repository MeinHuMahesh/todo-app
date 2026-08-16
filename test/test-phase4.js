// Phase 4 offline-queue test (no network, no UI): verifies queueing, deleted-ID
// tracking, and flush behavior against a mocked Supabase client.
// Run:  node test/test-phase4.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function stubEl() {
    return {
        addEventListener() {}, appendChild() {}, focus() {}, select() {}, replaceWith() {},
        setAttribute() {}, remove() {}, getAttribute() { return null; },
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        style: {}, dataset: {},
        querySelector() { return stubEl(); },
        innerHTML: '', textContent: '', value: '', hidden: false, disabled: false, title: '', tabIndex: 0
    };
}

const idbMock = { saved: null };
const OfflineStoreMock = {
    save: async d => { idbMock.saved = JSON.parse(JSON.stringify(d)); },
    load: async () => idbMock.saved,
    clear: async () => { idbMock.saved = null; }
};

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
        supabase: null,
        OfflineStore: OfflineStoreMock
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
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
    get offlineQueue() { return offlineQueue; },
    set offlineQueue(v) { offlineQueue = v; },
    get deletedIds() { return deletedIds; },
    set deletedIds(v) { deletedIds = v; },
    get sb() { return sb; },
    set sb(v) { sb = v; },
    get session() { return session; },
    set session(v) { session = v; },
    get trash() { return trash; },
    persist, syncOfflineQueue, queueForSync, deleteTodo, undoTrash, finalizeTrash, showToast, toRow, normalize
};
`, sandbox);

const S = sandbox.__test;

function mockSb(failAll) {
    const calls = { upserts: [], deletes: [] };
    return {
        calls,
        from() {
            return {
                upsert: async rows => {
                    calls.upserts.push(rows);
                    return failAll ? { error: new Error('offline') } : { error: null };
                },
                delete: () => ({
                    eq: async (col, id) => {
                        calls.deletes.push(id);
                        return failAll ? { error: new Error('offline') } : { error: null };
                    },
                    in: async () => failAll ? { error: new Error('offline') } : { error: null }
                })
            };
        }
    };
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('PASS - ' + name); }
    else { fail++; console.log('FAIL - ' + name + (extra ? ' :: ' + extra : '')); }
}

(async () => {
    // Let the app's async init() finish before we start mutating its state.
    await new Promise(r => setTimeout(r, 50));

    const T = (id, text) => S.normalize({ id, text, completed: false, priority: 'medium', position: 0, createdAt: 0 });

    // 1. Offline persist queues a snapshot in IndexedDB
    S.todos = [T(1, 'A'), T(2, 'B')];
    S.sb = mockSb(true);
    S.session = { user: { id: 'u1' } };
    sandbox.navigator.onLine = false;
    S.persist();
    check('offline persist queues snapshot', !!S.offlineQueue && S.offlineQueue.todos.length === 2 && !!idbMock.saved);
    check('queue snapshot persisted to IndexedDB', idbMock.saved && idbMock.saved.todos.length === 2);

    // 2. Online flush succeeds -> upserts rows, clears store
    S.sb = mockSb(false);
    sandbox.navigator.onLine = true;
    await S.syncOfflineQueue();
    check('flush upserts queued todos', S.sb.calls.upserts.length === 1 && S.sb.calls.upserts[0].length === 2);
    check('flush clears IndexedDB store', idbMock.saved === null);
    check('flush clears in-memory queue', S.offlineQueue === null);

    // 3. Failed flush preserves the queue
    S.todos = [T(3, 'C')];
    S.sb = mockSb(true);
    sandbox.navigator.onLine = false;
    S.persist();
    sandbox.navigator.onLine = true;
    await S.syncOfflineQueue();
    check('failed flush keeps queue for retry', !!S.offlineQueue && S.offlineQueue.todos[0].text === 'C' && !!idbMock.saved);

    // 4. Offline delete is tracked as deletedIds and removed locally
    S.sb = mockSb(true);
    sandbox.navigator.onLine = false;
    S.todos = [T(1, 'A'), T(2, 'B')];
    S.deleteTodo(1);
    check('offline delete removes locally', S.todos.length === 1 && S.todos[0].id === 2);
    check('deleted task held in undo trash', S.trash.length === 1 && S.trash[0].items[0].id === 1);
    S.finalizeTrash(S.trash[0]);
    check('offline delete recorded in deletedIds', S.deletedIds.includes(1));
    check('offline delete recorded in IndexedDB queue', idbMock.saved && idbMock.saved.deletedIds.includes(1));

    // 5. Flush after offline delete: upsert remaining + delete the removed id
    S.sb = mockSb(false);
    sandbox.navigator.onLine = true;
    await S.syncOfflineQueue();
    check('flush upserts remaining todos', S.sb.calls.upserts[0].length === 1 && S.sb.calls.upserts[0][0].id === 2);
    check('flush sends delete for removed id', S.sb.calls.deletes.join() === '1');
    check('deletedIds cleared after flush', S.deletedIds.length === 0);
    check('store cleared after flush', idbMock.saved === null);

    // 6. Online delete with failing backend gets queued too
    S.todos = [T(7, 'G')];
    S.sb = mockSb(true);
    sandbox.navigator.onLine = true;
    S.deleteTodo(7);
    S.finalizeTrash(S.trash[0]);
    await new Promise(r => setTimeout(r, 10));
    check('failed online delete queued for retry', S.deletedIds.includes(7) && !!S.offlineQueue);

    // 7. Deleting ALL todos offline still flushes the deletes (empty todos queue)
    S.sb = mockSb(true);
    sandbox.navigator.onLine = false;
    S.todos = [T(11, 'X'), T(12, 'Y')];
    S.deletedIds = [];
    S.trash.length = 0;
    S.deleteTodo(11);
    S.deleteTodo(12);
    S.finalizeTrash(S.trash[0]);
    S.finalizeTrash(S.trash[0]);
    sandbox.navigator.onLine = true;
    S.sb = mockSb(false);
    await S.syncOfflineQueue();
    check('empty-todo queue still sends deletes', S.sb.calls.deletes.sort().join() === '11,12');
    check('upsert skipped for empty todo list', S.sb.calls.upserts.length === 0);
    check('queue cleared after delete-only flush', idbMock.saved === null && S.offlineQueue === null);

    // 8. persist routes to full flush when pending deletes exist, not a bare push
    S.todos = [T(3, 'C')];
    S.deletedIds = [99];
    S.offlineQueue = null;
    idbMock.saved = { todos: [], deletedIds: [99] };
    S.sb = mockSb(false);
    sandbox.navigator.onLine = true;
    S.persist();
    await new Promise(r => setTimeout(r, 10));
    check('persist flushes pending deletes first', S.sb.calls.deletes.join() === '99' && S.deletedIds.length === 0);

    console.log('\nResult: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
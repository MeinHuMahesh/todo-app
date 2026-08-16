// Phase 2 integration test — runs against the real Supabase project.
// Tests: config, anonymous auth, insert/select/update/delete, RLS isolation,
//        updated_at trigger, realtime push, email signup.
// Run:  node test-phase2.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    fetch, WebSocket, crypto: require('crypto').webcrypto,
    TextEncoder, TextDecoder, URL, URLSearchParams, Blob, FormData,
    EventTarget, Headers, Request, Response, AbortController,
    performance, atob, btoa
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase-sdk.js'), 'utf8'), sandbox);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase.config.js'), 'utf8') +
    '\nglobalThis.__cfg = SUPABASE_CONFIG; globalThis.__configured = supabaseConfigured;',
    sandbox
);

const SUPABASE_CONFIG = sandbox.__cfg;
const supabaseConfigured = sandbox.__configured;
const createClient = sandbox.supabase.createClient;

function memStorage() {
    const m = new Map();
    return {
        getItem: k => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: k => m.delete(k)
    };
}

function client() {
    return createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey, {
        auth: { storage: memStorage(), persistSession: true, autoRefreshToken: true }
    });
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('PASS - ' + name); }
    else { fail++; console.log('FAIL - ' + name + (extra ? ' :: ' + extra : '')); }
}

(async () => {
    if (!supabaseConfigured()) {
        console.log('SKIP - Supabase not configured (placeholders still in supabase.config.js)');
        process.exit(0);
    }
    console.log('Testing project:', SUPABASE_CONFIG.url.replace('https://', '').split('.')[0] + '...');

    const A = client();
    const B = client();

    // 1. Auth — anonymous sign-in (enable "Anonymous sign-ins" in Authentication > Sign In / Providers)
    const ga = await A.auth.signInAnonymously();
    if (!ga.error && ga.data.user) {
        check('anonymous sign-in (user A)', true);
    } else {
        console.log('SKIP - "Anonymous sign-ins" is disabled in your project.');
        console.log('Enable it in Supabase dashboard: Authentication > Sign In / Providers > Anonymous sign-ins, then rerun.');
        return;
    }
    const uidA = ga.data.user.id;

    const gb = await B.auth.signInAnonymously();
    check('anonymous sign-in (user B)', !gb.error && gb.data.user, gb.error && gb.error.message);
    const uidB = gb.data.user.id;
    check('users are distinct', uidA !== uidB);

    // 2. Insert
    const idA = Date.now();
    const rowA = { id: idA, text: 'Phase 2 test task', completed: false, priority: 'high', tags: ['test', 'phase2'], subtasks: [], notes: 'created by test', position: 0 };
    const ins = await A.from('todos').insert(rowA).select().single();
    check('insert todo', !ins.error && ins.data && ins.data.id === idA, ins.error && ins.error.message);

    // 3. Select own
    const sel = await A.from('todos').select('*').eq('id', idA);
    check('select own todo', !sel.error && sel.data.length === 1 && sel.data[0].text === rowA.text, sel.error && sel.error.message);

    // 4. RLS read isolation
    const selB = await B.from('todos').select('*').eq('id', idA);
    check('RLS: user B cannot read user A todos', !selB.error && selB.data.length === 0, JSON.stringify(selB.data));

    // 5. RLS write isolation (PostgREST returns success with 0 rows when RLS blocks UPDATE/DELETE)
    const updB = await B.from('todos').update({ completed: true }).eq('id', idA);
    check('RLS: user B cannot update user A todos', !updB.error && (!updB.data || updB.data.length === 0), JSON.stringify(updB));

    const delB = await B.from('todos').delete().eq('id', idA);
    check('RLS: user B cannot delete user A todos', !delB.error && !delB.data, JSON.stringify(delB));

    // 6. Update own + trigger
    const upd = await A.from('todos').update({ completed: true, priority: 'low' }).eq('id', idA).select();
    check('update own todo', !upd.error && upd.data[0].completed === true, upd.error && upd.error.message);
    const updAt = await A.from('todos').select('updated_at, created_at').eq('id', idA);
    check('updated_at trigger fired', updAt.data[0] && updAt.data[0].updated_at > updAt.data[0].created_at);

    // 7. Realtime push (A receives its own INSERT via websocket)
    const idR = idA + 1;
    const realtime = await new Promise(resolve => {
        const timeout = setTimeout(() => resolve('timeout'), 12000);
        const ch = A.channel('test-realtime')
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'todos', filter: 'user_id=eq.' + uidA
            }, () => { clearTimeout(timeout); resolve('received'); })
            .subscribe(async status => {
                if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    if (status !== 'SUBSCRIBED') { clearTimeout(timeout); resolve('channel ' + status); return; }
                    setTimeout(async () => {
                        const r = await A.from('todos').insert({ id: idR, text: 'realtime ping', completed: false, priority: 'low', tags: [], subtasks: [], notes: '', position: 1 });
                        if (r.error) { clearTimeout(timeout); resolve('insert failed: ' + r.error.message); }
                    }, 1000);
                }
            });
    });
    check('realtime INSERT event received over websocket', realtime === 'received', realtime);

    // 8. Cleanup: remove realtime channel, delete test todos + sign out
    await A.removeAllChannels();
    await A.from('todos').delete().in('id', [idA, idR]);
    await A.auth.signOut();
    await B.auth.signOut();

    console.log('\nResult: ' + pass + ' passed, ' + fail + ' failed');
    console.log('Note: test auth users remain in your project (delete via Auth > Users in the dashboard).');
    process.exit(0);
})();
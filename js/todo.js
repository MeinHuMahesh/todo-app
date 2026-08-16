const API_URL = 'https://jsonplaceholder.typicode.com/todos?_limit=10';
const STORAGE_KEY = 'todo-app-state-v2';
const LEGACY_KEY = 'todo-app-state';
const THEME_KEY = 'todo-app-theme';
const PRIORITIES = ['low', 'medium', 'high'];

let sb = null;
let backendError = null;

const themeBtn = document.getElementById('theme-toggle');
const metaTheme = document.querySelector ? document.querySelector('meta[name="theme-color"]') : null;

function getSystemTheme() {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

function getSavedTheme() {
    try {
        const v = localStorage.getItem(THEME_KEY);
        return v === 'dark' || v === 'light' ? v : null;
    } catch (e) {
        return null;
    }
}

function applyTheme(theme) {
    if (document.documentElement) document.documentElement.dataset.theme = theme;
    if (metaTheme && metaTheme.setAttribute) metaTheme.setAttribute('content', theme === 'dark' ? '#4c1d95' : '#6366f1');
    if (themeBtn) {
        themeBtn.textContent = theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
        if (themeBtn.setAttribute) {
            themeBtn.setAttribute('aria-pressed', String(theme === 'dark'));
            themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        }
    }
}

function initTheme() {
    applyTheme(getSavedTheme() || getSystemTheme());
    if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        if (mq && mq.addEventListener) {
            mq.addEventListener('change', e => {
                if (!getSavedTheme()) applyTheme(e.matches ? 'dark' : 'light');
            });
        }
    }
}

if (themeBtn) {
    themeBtn.addEventListener('click', () => {
        const next = (getSavedTheme() || getSystemTheme()) === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
        applyTheme(next);
    });
}

initTheme();

function initClient() {
    if (!supabaseConfigured()) {
        backendError = 'Supabase not configured — add your project URL and publishable key in supabase.config.js.';
        return;
    }
    if (typeof supabase !== 'object' || typeof supabase.createClient !== 'function') {
        backendError = 'Supabase SDK failed to load — running in local mode.';
        return;
    }
    sb = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey);
}

let todos = [];
let currentFilter = 'all';
let selectedPriority = 'medium';
let session = null;
let channel = null;
let offlineQueue = null;
let deletedIds = [];
let isEditing = false;
let searchQuery = '';
let sortMode = 'manual';
let tagFilter = null;
let selectedId = null;
let dragId = null;
const expanded = new Set();

const listEl = document.getElementById('todo-list');
const inputEl = document.getElementById('todo-name');
const dateEl = document.getElementById('due-date');
const tagEl = document.getElementById('tag-input');
const tagSuggestionsEl = document.getElementById('tag-suggestions');
const optionsRow = document.getElementById('options-row');
const optionsBtn = document.getElementById('toggle-options');
const searchEl = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const tagFilterBar = document.getElementById('tag-filter-bar');
const tagFilterName = document.getElementById('tag-filter-name');
const tagFilterClear = document.getElementById('tag-filter-clear');
const loadingEl = document.getElementById('loading');
const emptyStateEl = document.getElementById('empty-state');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const itemsLeftEl = document.getElementById('items-left');
const clearBtn = document.getElementById('clear-btn');

const authOverlay = document.getElementById('auth-overlay');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authSubmit = document.getElementById('auth-submit');
const authSubtitle = document.getElementById('auth-subtitle');
const authError = document.getElementById('auth-error');
const authToggle = document.getElementById('auth-toggle');
const authGuest = document.getElementById('auth-guest');
const userRow = document.getElementById('user-row');
const userEmail = document.getElementById('user-email');
const signOutBtn = document.getElementById('sign-out');
const bannerEl = document.getElementById('sync-banner');

let authMode = 'signin';

function normalize(t) {
    return {
        id: t.id,
        text: t.text,
        completed: !!t.completed,
        dueDate: t.dueDate || null,
        priority: PRIORITIES.includes(t.priority) ? t.priority : 'low',
        tags: Array.isArray(t.tags) ? t.tags.slice(0, 6) : [],
        subtasks: Array.isArray(t.subtasks)
            ? t.subtasks.map(s => ({ id: s.id, text: s.text, completed: !!s.completed }))
            : [],
        notes: t.notes || '',
        position: typeof t.position === 'number' ? t.position : 0,
        createdAt: t.createdAt || Date.now(),
        updatedAt: t.updatedAt || Date.now()
    };
}

function toRow(t) {
    return {
        id: t.id,
        text: t.text,
        completed: t.completed,
        due_date: t.dueDate,
        priority: t.priority,
        tags: t.tags,
        subtasks: t.subtasks,
        notes: t.notes,
        position: t.position
    };
}

function fromRow(r) {
    return normalize({
        id: r.id,
        text: r.text,
        completed: r.completed,
        dueDate: r.due_date,
        priority: r.priority,
        tags: r.tags || [],
        subtasks: r.subtasks || [],
        notes: r.notes || '',
        position: r.position,
        createdAt: r.created_at,
        updatedAt: r.updated_at
    });
}

function loadMirror() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            todos = JSON.parse(saved).map(normalize);
            return true;
        }
    } catch (e) {
        console.warn('Could not read saved todos:', e);
    }
    return false;
}

function saveMirror() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function migrateLegacy() {
    try {
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) {
            const old = JSON.parse(legacy);
            todos = old.map((t, i) => normalize({ ...t, position: i }));
            localStorage.removeItem(LEGACY_KEY);
            saveMirror();
            return true;
        }
    } catch (e) {
        console.warn('Could not migrate legacy todos:', e);
    }
    return false;
}

async function fetchDemoTodos() {
    loadingEl.style.display = 'block';
    listEl.innerHTML = '';
    try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        todos = data.map((t, i) => ({
            id: t.id,
            text: t.title,
            completed: t.completed,
            dueDate: null,
            priority: PRIORITIES[i % 3],
            tags: [],
            subtasks: [],
            notes: '',
            position: i,
            createdAt: Date.now(),
            updatedAt: Date.now()
        }));
        saveMirror();
    } catch (err) {
        console.error('Failed to fetch todos:', err);
        if (!migrateLegacy() && !loadMirror()) {
            todos = [
                { id: 1, text: 'Try adding your first task', completed: false, priority: 'medium', position: 0 },
                { id: 2, text: 'Click the circle to complete it', completed: true, priority: 'low', position: 1 }
            ].map(normalize);
        }
    } finally {
        loadingEl.style.display = 'none';
        render();
    }
}

async function loadFromBackend() {
    loadingEl.style.display = 'block';
    listEl.innerHTML = '';
    try {
        const { data, error } = await sb
            .from('todos')
            .select('*')
            .order('position', { ascending: true });
        if (error) throw error;

        if (data && data.length) {
            todos = data.map(fromRow);
            saveMirror();
        } else if (migrateLegacy() || loadMirror()) {
            await pushTodosToBackend();
        } else {
            await fetchDemoTodos();
        }
    } catch (err) {
        console.error('Failed to load from Supabase:', err);
        if (!migrateLegacy() && !loadMirror()) {
            await fetchDemoTodos();
        }
    } finally {
        loadingEl.style.display = 'none';
        render();
    }
}

async function pushTodosToBackend() {
    if (!sb || !session) return;
    try {
        const { error } = await sb.from('todos').upsert(todos.map(toRow));
        if (error) throw error;
        offlineQueue = null;
        deletedIds = [];
        if (window.OfflineStore) window.OfflineStore.clear().catch(() => {});
    } catch (err) {
        console.error('Sync to Supabase failed (queued for retry):', err);
        queueForSync();
    }
}

function queueForSync() {
    offlineQueue = { todos: todos.slice(), deletedIds: deletedIds.slice() };
    if (window.OfflineStore) {
        window.OfflineStore.save(offlineQueue).catch(err => console.warn('Could not persist offline queue:', err));
    }
}

async function syncOfflineQueue() {
    if (!sb || !session || !navigator.onLine) return;
    let queued = offlineQueue;
    if ((!queued || !queued.todos) && window.OfflineStore) {
        queued = await window.OfflineStore.load();
    }
    if (!queued || !queued.todos || (!queued.todos.length && !(queued.deletedIds || []).length)) return;
    offlineQueue = null;
    try {
        if (queued.todos.length) {
            const { error } = await sb.from('todos').upsert(queued.todos.map(toRow));
            if (error) throw error;
        }
        for (const id of (queued.deletedIds || [])) {
            const del = await sb.from('todos').delete().eq('id', id);
            if (del.error) throw del.error;
        }
        deletedIds = deletedIds.filter(id => !(queued.deletedIds || []).includes(id));
        if (window.OfflineStore) await window.OfflineStore.clear();
    } catch (err) {
        console.error('Offline queue sync failed:', err);
        offlineQueue = queued;
    }
}

function persist() {
    saveMirror();
    if (sb && session && navigator.onLine) {
        if (offlineQueue || deletedIds.length) {
            syncOfflineQueue();
        } else {
            pushTodosToBackend();
        }
    } else if (sb && session) {
        queueForSync();
    }
}

function setupRealtime() {
    if (!sb || !session || channel) return;
    channel = sb
        .channel('todos-realtime')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'todos',
            filter: 'user_id=eq.' + session.user.id
        }, payload => {
            if (isEditing) return;
            const remote = payload.new;
            if (payload.eventType === 'INSERT') {
                if (!todos.some(t => t.id === remote.id)) {
                    todos.push(fromRow(remote));
                }
            } else if (payload.eventType === 'UPDATE') {
                const idx = todos.findIndex(t => t.id === remote.id);
                if (idx !== -1) todos[idx] = fromRow(remote);
            } else if (payload.eventType === 'DELETE') {
                todos = todos.filter(t => t.id !== payload.old.id);
            }
            saveMirror();
            render();
        })
        .subscribe();
}

function teardownRealtime() {
    if (sb && channel) {
        sb.removeChannel(channel);
        channel = null;
    }
}

async function enterApp(user) {
    session = { user };
    bannerEl.hidden = true;
    userEmail.textContent = user.email || (user.is_anonymous ? 'Guest' : 'Unknown user');
    userRow.hidden = false;
    authOverlay.classList.add('hidden');
    await loadFromBackend();
    setupRealtime();
    syncOfflineQueue();
}

async function signOut() {
    teardownRealtime();
    await sb.auth.signOut();
    session = null;
    userRow.hidden = true;
    authError.textContent = '';
    authPassword.value = '';
    showLogin();
}

function showLogin() {
    if (!sb) {
        authOverlay.classList.add('hidden');
        if (backendError) showBanner(backendError);
        return;
    }
    authOverlay.classList.remove('hidden');
    authSubtitle.textContent = 'Sign in to sync your tasks across devices';
    authEmail.focus();
}

function showBanner(msg) {
    bannerEl.textContent = msg;
    bannerEl.hidden = false;
}

function setAuthMode(mode) {
    authMode = mode;
    const signin = mode === 'signin';
    authSubmit.textContent = signin ? 'Sign in' : 'Create account';
    authSubtitle.textContent = signin
        ? 'Sign in to sync your tasks across devices'
        : 'Create an account to sync your tasks';
    authToggle.textContent = signin ? 'Create one' : 'Sign in instead';
    authPassword.autocomplete = signin ? 'current-password' : 'new-password';
}

async function handleAuth(e) {
    e.preventDefault();
    const email = authEmail.value.trim();
    const password = authPassword.value;
    if (!email || !password) {
        authError.textContent = 'Please enter email and password.';
        return;
    }
    authError.textContent = '';
    authSubmit.disabled = true;
    authSubmit.textContent = 'Please wait...';
    try {
        const { data, error } = authMode === 'signin'
            ? await sb.auth.signInWithPassword({ email, password })
            : await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
            await enterApp(data.session.user);
        } else {
            authError.textContent = 'Check your email to confirm your account, then sign in.';
            setAuthMode('signin');
        }
    } catch (err) {
        authError.textContent = err.message || 'Authentication failed.';
    } finally {
        authSubmit.disabled = false;
        authSubmit.textContent = authMode === 'signin' ? 'Sign in' : 'Create account';
    }
}

async function signInAsGuest() {
    authError.textContent = '';
    authGuest.disabled = true;
    try {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) throw error;
        await enterApp(data.user);
    } catch (err) {
        authError.textContent = err.message || 'Could not start a guest session.';
        authGuest.disabled = false;
    }
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

function parseLocalDate(s) {
    const parts = String(s).split('-').map(Number);
    return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
}

function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function getVisible() {
    let list = [...todos];
    const today = startOfToday();

    if (currentFilter === 'active') list = list.filter(t => !t.completed);
    else if (currentFilter === 'completed') list = list.filter(t => t.completed);
    else if (currentFilter === 'today') list = list.filter(t => t.dueDate && parseLocalDate(t.dueDate).getTime() === today.getTime());
    else if (currentFilter === 'overdue') list = list.filter(t => !t.completed && t.dueDate && parseLocalDate(t.dueDate) < today);

    if (tagFilter) list = list.filter(t => t.tags.includes(tagFilter));

    if (searchQuery) {
        list = list.filter(t =>
            t.text.toLowerCase().includes(searchQuery) ||
            t.tags.some(tag => tag.toLowerCase().includes(searchQuery))
        );
    }

    switch (sortMode) {
        case 'due':
            list.sort((a, b) => {
                const da = a.dueDate || '9999-12-31';
                const db = b.dueDate || '9999-12-31';
                return da < db ? -1 : da > db ? 1 : 0;
            });
            break;
        case 'priority':
            list.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
            break;
        case 'created':
            list.sort((a, b) => b.createdAt - a.createdAt);
            break;
        default:
            list.sort((a, b) => a.position - b.position);
    }
    return list;
}

function dueBadge(todo) {
    if (!todo.dueDate) return null;
    const today = startOfToday();
    const due = parseLocalDate(todo.dueDate);
    const diff = (due - today) / 86400000;

    let cls = 'future';
    if (!todo.completed && diff < 0) cls = 'overdue';
    else if (diff === 0) cls = 'today';

    const label = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const span = document.createElement('span');
    span.className = 'due-badge ' + cls;
    span.textContent = label;
    return span;
}

function render() {
    const filtered = getVisible();
    listEl.innerHTML = '';

    filtered.forEach(todo => {
        listEl.appendChild(createItem(todo));
    });

    emptyStateEl.classList.toggle('visible', filtered.length === 0);
    const emptyMsg = emptyStateEl.querySelector('p');
    emptyMsg.textContent = todos.length === 0
        ? 'Nothing here yet. Add a task above!'
        : 'No tasks match your current view.';

    const allTags = [...new Set(todos.flatMap(t => t.tags))].sort();
    tagSuggestionsEl.innerHTML = '';
    allTags.forEach(tag => {
        const opt = document.createElement('option');
        opt.value = tag;
        tagSuggestionsEl.appendChild(opt);
    });

    tagFilterBar.hidden = !tagFilter;
    if (tagFilter) tagFilterName.textContent = tagFilter;

    const total = todos.length;
    const done = todos.filter(t => t.completed).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    progressFill.style.width = pct + '%';
    progressText.textContent = pct + '%';
    itemsLeftEl.textContent = (total - done) + (total - done === 1 ? ' item left' : ' items left');
}

function createItem(todo) {
    const li = document.createElement('li');
    li.className = 'todo-item'
        + (todo.completed ? ' completed' : '')
        + (selectedId === todo.id ? ' selected' : '');
    li.draggable = true;
    li.tabIndex = 0;
    li.title = 'Drag to reorder \u2022 click to select';
    li.setAttribute('aria-label', (todo.completed ? 'Completed: ' : '') + todo.text);

    li.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            if (e.target === li && e.key === ' ') e.preventDefault();
            if (e.target === li) {
                selectedId = selectedId === todo.id ? null : todo.id;
                render();
            }
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const items = listEl.querySelectorAll('.todo-item');
            const idx = Array.from(items).indexOf(li);
            const next = items[e.key === 'ArrowDown' ? idx + 1 : idx - 1];
            if (next) {
                next.focus();
                const other = todos.find(t => String(t.id) === next.dataset.id);
                if (other) {
                    selectedId = other.id;
                    render();
                }
            }
        }
    });

    li.dataset.id = todo.id;

    li.addEventListener('dragstart', e => {
        dragId = todo.id;
        if (sortMode !== 'manual') {
            sortMode = 'manual';
            sortSelect.value = 'manual';
        }
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        dragId = null;
    });
    li.addEventListener('dragover', e => {
        e.preventDefault();
        li.classList.add('drag-over');
    });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
    li.addEventListener('drop', e => {
        e.preventDefault();
        li.classList.remove('drag-over');
        if (dragId !== null && dragId !== todo.id) reorderTodo(dragId, todo.id);
        dragId = null;
    });
    li.addEventListener('click', e => {
        if (e.target.closest('button, input, textarea')) return;
        if (selectedId !== todo.id) {
            selectedId = todo.id;
            render();
        }
    });

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'todo-checkbox';
    checkbox.checked = todo.completed;
    checkbox.setAttribute('aria-label', 'Toggle ' + todo.text);
    checkbox.addEventListener('change', () => toggleTodo(todo.id));

    const content = document.createElement('div');
    content.className = 'todo-content';

    const main = document.createElement('div');
    main.className = 'todo-main';

    const dot = document.createElement('span');
    dot.className = 'priority-dot priority-' + todo.priority;
    dot.title = 'Priority: ' + todo.priority;
    dot.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'todo-text';
    text.textContent = todo.text;
    text.title = 'Double-click to edit';
    text.addEventListener('dblclick', () => startEdit(todo, text));

    main.appendChild(dot);
    main.appendChild(text);

    const badge = dueBadge(todo);
    if (badge) main.appendChild(badge);

    if (todo.tags.length) {
        const chips = document.createElement('div');
        chips.className = 'tag-chips';
        todo.tags.forEach(tag => {
            const chip = document.createElement('button');
            chip.className = 'tag-chip' + (tagFilter === tag ? ' filtered' : '');
            chip.textContent = tag;
            chip.title = tagFilter === tag ? 'Clear tag filter' : 'Filter by "' + tag + '"';
            chip.setAttribute('aria-label', tagFilter === tag ? 'Clear tag filter for "' + tag + '"' : 'Filter by tag "' + tag + '"');
            chip.addEventListener('click', e => {
                e.stopPropagation();
                tagFilter = (tagFilter === tag) ? null : tag;
                render();
            });
            chips.appendChild(chip);
        });
        main.appendChild(chips);
    }

    if (todo.subtasks.length) {
        const count = document.createElement('span');
        count.className = 'subtask-count';
        const doneSubs = todo.subtasks.filter(s => s.completed).length;
        count.textContent = doneSubs + '/' + todo.subtasks.length;
        main.appendChild(count);
    }

    const expandBtn = document.createElement('button');
    expandBtn.className = 'expand-btn';
    expandBtn.textContent = expanded.has(todo.id) ? '\u25B4' : '\u25BE';
    expandBtn.title = 'Subtasks & notes';
    expandBtn.setAttribute('aria-label', expanded.has(todo.id) ? 'Collapse details' : 'Expand details');
    expandBtn.setAttribute('aria-expanded', String(expanded.has(todo.id)));
    expandBtn.addEventListener('click', () => {
        expanded.has(todo.id) ? expanded.delete(todo.id) : expanded.add(todo.id);
        render();
    });
    main.appendChild(expandBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = '\u00D7';
    delBtn.title = 'Delete task';
    delBtn.setAttribute('aria-label', 'Delete ' + todo.text);
    delBtn.addEventListener('click', () => deleteTodo(todo.id));
    main.appendChild(delBtn);

    content.appendChild(main);

    if (expanded.has(todo.id)) {
        const detail = document.createElement('div');
        detail.className = 'todo-detail open';

        const subList = document.createElement('div');
        subList.className = 'subtask-list';
        todo.subtasks.forEach(sub => {
            const subItem = document.createElement('div');
            subItem.className = 'subtask-item' + (sub.completed ? ' completed' : '');

            const subCheck = document.createElement('input');
            subCheck.type = 'checkbox';
            subCheck.className = 'subtask-checkbox';
            subCheck.checked = sub.completed;
            subCheck.setAttribute('aria-label', 'Toggle subtask ' + sub.text);
            subCheck.addEventListener('change', () => toggleSubtask(todo.id, sub.id));

            const subText = document.createElement('span');
            subText.className = 'subtask-text';
            subText.textContent = sub.text;

            const subDel = document.createElement('button');
            subDel.className = 'subtask-delete';
            subDel.textContent = '\u00D7';
            subDel.setAttribute('aria-label', 'Remove subtask ' + sub.text);
            subDel.addEventListener('click', () => removeSubtask(todo.id, sub.id));

            subItem.appendChild(subCheck);
            subItem.appendChild(subText);
            subItem.appendChild(subDel);
            subList.appendChild(subItem);
        });
        detail.appendChild(subList);

        const subAddRow = document.createElement('div');
        subAddRow.className = 'subtask-add-row';
        const subInput = document.createElement('input');
        subInput.className = 'subtask-input';
        subInput.type = 'text';
        subInput.placeholder = 'Add a subtask...';
        const subBtn = document.createElement('button');
        subBtn.className = 'subtask-add';
        subBtn.textContent = 'Add';
        subBtn.setAttribute('aria-label', 'Add subtask');
        subBtn.addEventListener('click', () => {
            const v = subInput.value.trim();
            if (v) addSubtask(todo.id, v);
        });
        subInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                const v = subInput.value.trim();
                if (v) addSubtask(todo.id, v);
            }
        });
        subAddRow.appendChild(subInput);
        subAddRow.appendChild(subBtn);
        detail.appendChild(subAddRow);

        const notes = document.createElement('textarea');
        notes.className = 'notes-input';
        notes.placeholder = 'Notes...';
        notes.value = todo.notes;
        notes.addEventListener('change', () => {
            todo.notes = notes.value;
            todo.updatedAt = Date.now();
            persist();
        });
        detail.appendChild(notes);

        content.appendChild(detail);
    }

    li.appendChild(checkbox);
    li.appendChild(content);
    return li;
}

function startEdit(todo, span) {
    isEditing = true;
    const input = document.createElement('input');
    input.className = 'edit-input';
    input.value = todo.text;
    span.replaceWith(input);
    input.focus();
    input.select();
    let done = false;

    const commit = () => {
        if (done) return;
        done = true;
        isEditing = false;
        const v = input.value.trim();
        if (v) {
            todo.text = v;
            todo.updatedAt = Date.now();
            persist();
        }
        render();
    };

    const cancel = () => {
        if (done) return;
        done = true;
        isEditing = false;
        render();
    };

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') cancel();
    });
    input.addEventListener('blur', commit);
}

function addTodo() {
    const text = inputEl.value.trim();
    if (!text) {
        inputEl.classList.add('shake');
        setTimeout(() => inputEl.classList.remove('shake'), 400);
        return;
    }

    const tags = tagEl.value.split(',').map(t => t.trim()).filter(Boolean).slice(0, 6);
    const minPos = todos.length ? Math.min(...todos.map(t => t.position)) : 0;

    todos.push({
        id: Date.now(),
        text,
        completed: false,
        dueDate: dateEl.value || null,
        priority: selectedPriority,
        tags,
        subtasks: [],
        notes: '',
        position: minPos - 1,
        createdAt: Date.now(),
        updatedAt: Date.now()
    });

    inputEl.value = '';
    dateEl.value = '';
    tagEl.value = '';
    persist();
    render();
}

function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (todo) {
        todo.completed = !todo.completed;
        todo.updatedAt = Date.now();
        persist();
        render();
    }
}

function reorderTodo(fromId, toId) {
    const sorted = [...todos].sort((a, b) => a.position - b.position);
    const fromIdx = sorted.findIndex(t => t.id === fromId);
    const toIdx = sorted.findIndex(t => t.id === toId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const [moved] = sorted.splice(fromIdx, 1);
    sorted.splice(toIdx, 0, moved);
    sorted.forEach((t, i) => {
        t.position = i;
        t.updatedAt = Date.now();
    });
    persist();
    render();
}

function deleteTodo(id) {
    if (selectedId === id) selectedId = null;
    const todo = todos.find(t => t.id === id);
    if (!todo) return;
    todos = todos.filter(t => t.id !== id);
    persist();
    beginTrash([todo], 'Task deleted');
    render();
}

const toastArea = document.getElementById('toast-area');
const UNDO_WINDOW = 5000;
let trash = [];

function showToast(message, action) {
    if (!toastArea) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    const msg = document.createElement('span');
    msg.textContent = message;
    toast.appendChild(msg);
    if (action) {
        const btn = document.createElement('button');
        btn.className = 'toast-action';
        btn.textContent = action.label;
        btn.addEventListener('click', () => {
            clearTimeout(toast._timer);
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 250);
            action.run();
        });
        toast.appendChild(btn);
    }
    toast._timer = setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 250);
    }, 6000);
    toastArea.appendChild(toast);
}

function beginTrash(items, message) {
    const entry = { items, timer: null };
    entry.timer = setTimeout(() => finalizeTrash(entry), UNDO_WINDOW);
    trash.push(entry);
    showToast(message, { label: 'Undo', run: () => undoTrash(entry) });
}

function undoTrash(entry) {
    const idx = trash.indexOf(entry);
    if (idx === -1) return;
    trash.splice(idx, 1);
    clearTimeout(entry.timer);
    todos.push(...entry.items);
    persist();
    render();
    showToast('Task restored');
}

function finalizeTrash(entry) {
    const idx = trash.indexOf(entry);
    if (idx === -1) return;
    trash.splice(idx, 1);
    const ids = entry.items.map(t => t.id);
    if (sb && session && navigator.onLine) {
        sb.from('todos').delete().in('id', ids).then(res => {
            if (res.error) {
                console.error('Delete from Supabase failed:', res.error);
                ids.forEach(id => deletedIds.push(id));
                queueForSync();
            }
        });
    } else if (sb && session) {
        ids.forEach(id => deletedIds.push(id));
        queueForSync();
    }
}

function toggleSubtask(todoId, subId) {
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return;
    const sub = todo.subtasks.find(s => s.id === subId);
    if (sub) {
        sub.completed = !sub.completed;
        todo.updatedAt = Date.now();
        persist();
        render();
    }
}

function addSubtask(todoId, text) {
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return;
    todo.subtasks.push({ id: Date.now(), text, completed: false });
    todo.updatedAt = Date.now();
    persist();
    render();
}

function removeSubtask(todoId, subId) {
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return;
    todo.subtasks = todo.subtasks.filter(s => s.id !== subId);
    todo.updatedAt = Date.now();
    persist();
    render();
}

document.querySelectorAll('.prio-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.prio-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        selectedPriority = btn.dataset.priority;
    });
});

optionsBtn.addEventListener('click', () => {
    optionsRow.classList.toggle('open');
    optionsBtn.classList.toggle('open');
    optionsBtn.textContent = optionsRow.classList.contains('open') ? '\u2212' : '+';
    optionsBtn.setAttribute('aria-expanded', String(optionsRow.classList.contains('open')));
});

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        currentFilter = btn.dataset.filter;
        render();
    });
});

clearBtn.addEventListener('click', () => {
    const items = todos.filter(t => t.completed);
    if (!items.length) {
        showToast('Nothing to clear');
        return;
    }
    todos = todos.filter(t => !t.completed);
    persist();
    beginTrash(items, items.length === 1 ? '1 task cleared' : items.length + ' tasks cleared');
    render();
});

inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') addTodo();
});

searchEl.addEventListener('input', () => {
    searchQuery = searchEl.value.trim().toLowerCase();
    render();
});

sortSelect.addEventListener('change', () => {
    sortMode = sortSelect.value;
    render();
});

tagFilterClear.addEventListener('click', () => {
    tagFilter = null;
    render();
});

document.addEventListener('keydown', e => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'n' || e.key === 'N') {
        inputEl.focus();
        e.preventDefault();
    } else if (e.key === '/') {
        searchEl.focus();
        e.preventDefault();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId !== null) {
        deleteTodo(selectedId);
        e.preventDefault();
    } else if (e.key === 'Escape' && selectedId !== null) {
        selectedId = null;
        render();
    }
});

window.addEventListener('online', syncOfflineQueue);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}

authForm.addEventListener('submit', handleAuth);
authGuest.addEventListener('click', signInAsGuest);
authToggle.addEventListener('click', e => {
    e.preventDefault();
    setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
});
signOutBtn.addEventListener('click', signOut);

(async function init() {
    if (window.supabaseSDK) {
        await window.supabaseSDK;
    }
    initClient();

    if (!sb) {
        if (backendError) showBanner(backendError);
        authOverlay.classList.add('hidden');
        await fetchDemoTodos();
        return;
    }

    try {
        const { data } = await sb.auth.getSession();
        if (data.session) {
            await enterApp(data.session.user);
        } else {
            showLogin();
            loadMirror();
            render();
        }
    } catch (err) {
        console.error('Session check failed:', err);
        showLogin();
        authError.textContent = err.message || 'Could not reach the backend.';
        loadMirror();
        render();
    }
})();
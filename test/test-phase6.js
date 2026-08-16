// Phase 6 test (no network, no UI, no browser): static mobile/responsiveness
// contract checks against css/todo.css and todo.html.
// Catches regressions like flex overflow (inputs without min-width:0),
// iOS input zoom (font-size < 16px), sub-44px touch targets, unguarded :hover
// rules, and missing safe-area/dvh handling.
// Run:  node test/test-phase6.js
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'todo.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'todo.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('PASS - ' + name); }
    else { fail++; console.log('FAIL - ' + name + (extra ? ' :: ' + extra : '')); }
}

// Extract the balanced {} block starting at the given '{' index (returns text WITH braces).
function extractBlock(src, openIndex) {
    let depth = 0;
    for (let i = openIndex; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(openIndex, i + 1);
        }
    }
    return src.slice(openIndex);
}

// Return the first rule block whose selector line matches `selector` (a regex),
// or null. Used to inspect a specific rule outside media queries.
function ruleFor(selector) {
    const re = new RegExp('(?:^|\\n)\\s*' + selector + '\\s*\\{');
    const m = re.exec(css);
    if (!m) return null;
    return extractBlock(css, m.index + m[0].lastIndexOf('{'));
}

// Return ALL media blocks matching `name` (regex) concatenated, or null.
function mediaBlock(name) {
    const re = new RegExp('@media[^{]*' + name + '[^{]*\\{', 'g');
    let m, joined = '';
    while ((m = re.exec(css)) !== null) {
        joined += extractBlock(css, m.index + m[0].lastIndexOf('{')) + '\n';
    }
    return joined || null;
}

const inText = (block, needle) => block !== null && block.includes(needle);
const hasDecl = (block, prop, value) => block !== null && new RegExp(prop + '\\s*:\\s*' + value).test(block);

// Remove every `@media (hover: hover) and (pointer: fine) { ... }` block (balanced
// braces, tolerant of any formatting). Everything inside is touch-safe by design.
function stripHoverGuards(src) {
    const header = '@media (hover: hover) and (pointer: fine)';
    let out = src;
    let idx = out.indexOf(header);
    while (idx !== -1) {
        const open = out.indexOf('{', idx);
        const block = extractBlock(out, open);
        out = out.slice(0, idx) + out.slice(idx + block.length);
        idx = out.indexOf(header);
    }
    return out;
}

const base = {
    'todo-input': ruleFor('\\.todo-input'),
    'search-input': ruleFor('\\.search-input'),
    'date/tag inputs': ruleFor('\\.date-input,\\s*\\.tag-input'),
    'sort-select': ruleFor('\\.sort-select'),
    'theme-btn': ruleFor('\\.theme-btn'),
    'add-btn': ruleFor('\\.add-btn'),
    'options-btn': ruleFor('\\.options-btn'),
    'filter-btn': ruleFor('\\.filter-btn'),
    'todo-content': ruleFor('\\.todo-content'),
    'move-btn': ruleFor('\\.move-btn')
};
const desktop = mediaBlock('min-width: 768px');
const coarse = mediaBlock('pointer: coarse');

// --- Viewport & PWA metadata ---
const viewportMeta = /<meta\s+name="viewport"[^>]*>/.exec(html);
check('viewport meta present', !!viewportMeta);
if (viewportMeta) {
    const content = viewportMeta[0];
    check('viewport has width=device-width', content.includes('width=device-width'));
    check('viewport has initial-scale=1.0', content.includes('initial-scale=1.0'));
    check('viewport uses viewport-fit=cover (safe areas)', content.includes('viewport-fit=cover'));
}
check('favicon link present', html.includes('rel="icon"'));
check('apple-touch-icon present', html.includes('rel="apple-touch-icon"'));
check('manifest linked', html.includes('rel="manifest"'));

// --- No iOS input zoom: >= 16px on all text inputs at base ---
check('todo-input is 16px at base (prevents iOS zoom)', hasDecl(base['todo-input'], 'font-size', '16px'));
check('search-input is 16px at base', hasDecl(base['search-input'], 'font-size', '16px'));
check('date/tag inputs are 16px at base', hasDecl(base['date/tag inputs'], 'font-size', '16px'));
check('sort-select is 16px at base', hasDecl(base['sort-select'], 'font-size', '16px'));
check('desktop block compacts date/tag/search/sort to 13px', inText(desktop, 'font-size: 13px'));

// --- Flex overflow guards: min-width: 0 where a flex: 1 child can overflow ---
check('todo-input has min-width: 0 (flex overflow fix)', hasDecl(base['todo-input'], 'min-width', '0'));
check('todo-content has min-width: 0', hasDecl(base['todo-content'], 'min-width', '0'));
check('search-input has min-width: 0', hasDecl(base['search-input'], 'min-width', '0'));

// --- Touch targets >= 44px at base (or >= 44 in one dimension) ---
check('theme-btn is 44x44', hasDecl(base['theme-btn'], 'width', '44px') && hasDecl(base['theme-btn'], 'height', '44px'));
check('theme-btn not shrunk to 40px in desktop block', !/\.theme-btn \{[^}]*40px/.test(desktop));
check('sort-select is 44px tall', hasDecl(base['sort-select'], 'height', '44px'));
check('date/tag inputs are 44px tall', hasDecl(base['date/tag inputs'], 'height', '44px'));
check('search-input is 44px tall', hasDecl(base['search-input'], 'height', '44px'));
check('add-btn is >= 44px wide (min-width 76px)', /min-width:\s*7[6-9]px/.test(base['add-btn']));
check('options-btn is >= 44px wide (min-width 48px)', /min-width:\s*(4[8-9]|[5-9]\d)px/.test(base['options-btn']));
check('filter-btn is >= 44px wide (min-width 64px)', /min-width:\s*(4[4-9]|[5-9]\d)px/.test(base['filter-btn']));
check('todo-input is >= 44px tall (min-height 48px)', /min-height:\s*(4[4-9]|[5-9]\d)px/.test(base['todo-input']));

// --- Hover rules must be touch-safe (all wrapped in hover+fine media) ---
// Every guard block in this file wraps exactly one :hover rule, so a rule is
// guarded iff a media header precedes it. Scan forward and track state.
function unguardedHoverRules(src) {
    const re = /@media \(hover: hover\) and \(pointer: fine\)|(?:^|[\n}])\s*([^{}\n]*:hover\s*\{)/g;
    let m, inGuard = false, found = [];
    while ((m = re.exec(src)) !== null) {
        if (m[0].startsWith('@media')) { inGuard = true; continue; }
        if (m[1]) {
            if (!inGuard) found.push(m[1].trim());
            inGuard = false;
        }
    }
    return found;
}
const unguarded = unguardedHoverRules(css);
check('no unguarded :hover rules', unguarded.length === 0, unguarded.join(', '));

// --- Mobile layout / safe areas ---
check('body uses 100dvh (dynamic viewport)', css.includes('100dvh'));
check('uses env(safe-area-inset-*) for notches', css.includes('env(safe-area-inset-'));
check('no background-attachment: fixed (mobile jank)', !css.includes('background-attachment: fixed'));

// --- Touch-specific (pointer: coarse) block ---
check('coarse block shows move-btn', !!coarse && inText(coarse, 'display: inline-flex'));
check('coarse block widens add-btn to 88px', !!coarse && inText(coarse, 'min-width: 88px'));
check('coarse block keeps theme-btn 44x44', !!coarse && inText(coarse, 'width: 44px') && inText(coarse, 'height: 44px'));
check('coarse block lets todo-text wrap full width', !!coarse && inText(coarse, 'flex: 1 1 100%'));

// --- Desktop (>= 768px) restores compact layout ---
check('desktop media block exists', !!desktop);
check('desktop toolbar is single row', !!desktop && inText(desktop, 'flex-wrap: nowrap'));
check('desktop filters are single row', !!desktop && /\.filters \{[^}]*flex-wrap:\s*nowrap/.test(desktop));
check('desktop search-input takes flex 1', !!desktop && /\.search-input \{[^}]*flex:\s*1\s*;/.test(desktop));

// --- move-btn hidden at base ---
check('move-btn hidden by default (mouse users)', hasDecl(base['move-btn'], 'display', 'none'));

console.log('\nResult: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
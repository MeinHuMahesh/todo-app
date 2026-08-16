// One-time refactor: wraps every top-level :hover rule in a
// `@media (hover: hover) and (pointer: fine)` guard so touch devices
// never get stuck hover states (and hover effects are skipped entirely).
const fs = require('fs');

const file = 'css/todo.css';
let css = fs.readFileSync(file, 'utf8');
let wrapped = 0;

const re = /([^{}@][^{}]*\{[^{}]*\})/g;
css = css.replace(re, (block, full) => {
    const open = full.indexOf('{');
    const selector = full.slice(0, open).trim();
    if (!selector.endsWith(':hover') && !selector.includes(':hover,')) return full;
    wrapped++;
    return '@media (hover: hover) and (pointer: fine) {\n' + full + '}\n';
});

console.log('wrapped hover rules:', wrapped);
fs.writeFileSync(file, css);
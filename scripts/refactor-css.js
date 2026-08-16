// One-time refactor: converts hardcoded white-channel rgba() colors in
// css/todo.css into CSS-variable-based channels so a light theme can override them.
// color:  rgba(255,255,255,a) -> rgba(var(--text-rgb), a)
// background: ...           -> rgba(var(--surface-rgb), a)
// border*: ...              -> rgba(var(--border-rgb), a)
const fs = require('fs');

const file = 'css/todo.css';
const css = fs.readFileSync(file, 'utf8');

let out = css.replace(/rgba\(255, 255, 255, (\d+(?:\.\d+)?)\)/g, (m, a, offset) => {
    let start = Math.max(css.lastIndexOf(';', offset), css.lastIndexOf('{', offset), css.lastIndexOf('}', offset));
    const seg = css.slice(start + 1, offset);
    const prop = seg.split(':')[0].trim();
    if (prop === 'color') return `rgba(var(--text-rgb), ${a})`;
    if (prop === 'background') return `rgba(var(--surface-rgb), ${a})`;
    if (/^border/.test(prop)) return `rgba(var(--border-rgb), ${a})`;
    return m;
});

const before = css.match(/rgba\(255, 255, 255, [\d.]+\)/g) || [];
const after = out.match(/rgba\(255, 255, 255, [\d.]+\)/g) || [];
console.log('converted:', before.length - after.length, 'remaining:', after.length);
after.forEach(m => console.log('  left as-is:', m));

fs.writeFileSync(file, out);
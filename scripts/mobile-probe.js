// Mobile responsiveness probe — drives headless Edge over CDP and measures:
//   - horizontal overflow (elements sticking out of the viewport)
//   - touch-target sizes (< 44px for interactive elements)
//   - console errors
// at one or more viewport widths.
//
// Usage:  node scripts/mobile-probe.js [width,height] [url]
//   e.g.  node scripts/mobile-probe.js 375,812 http://localhost:8123/todo.html
//         node scripts/mobile-probe.js 320,640 http://localhost:8123/todo.html
const { spawn } = require('child_process');
const http = require('http');

const args = process.argv.slice(2);
const [width, height] = (args[0] || '375,812').split(',').map(Number);
const url = args[1] || 'http://localhost:8123/todo.html';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9222;

function getJson(path) {
    return new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: PORT, path }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

const PROBE = `(() => {
    const results = { href: location.href, ua: navigator.userAgent.slice(0, 80), viewportMeta: document.querySelector('meta[name="viewport"]')?.content || 'MISSING', innerWidth, scrollWidth: document.documentElement.scrollWidth, overflow: [], smallTargets: [], pointerCoarse: matchMedia('(pointer: coarse)').matches };
    const all = document.querySelectorAll('*');
    all.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (r.right > innerWidth + 1 || r.left < -1) {
            const tag = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '');
            results.overflow.push({ el: tag, left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
        }
        const interactive = el.matches('button, input, select, textarea, a');
        if (interactive && r.height > 0 && r.height < 44 && r.width > 0 && r.width < 44) {
            const tag = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '');
            results.smallTargets.push({ el: tag, w: Math.round(r.width), h: Math.round(r.height) });
        }
    });
    results.overflow = results.overflow.slice(0, 8);
    results.smallTargets = results.smallTargets.slice(0, 10);
    return results;
})()`;

async function main() {
    const edge = spawn(EDGE, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        `--window-size=${width},${height}`,
        `--remote-debugging-port=${PORT}`, 'about:blank'
    ], { stdio: 'ignore' });

    let targets;
    for (let i = 0; i < 40; i++) {
        try { targets = await getJson('/json'); if (targets.length) break; } catch (e) {}
        await new Promise(r => setTimeout(r, 250));
    }
    if (!targets || !targets.length) { console.error('CDP not reachable'); edge.kill(); process.exit(1); }

    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const msgId = ++id;
        pending.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params }));
    });

    ws.onmessage = e => {
        const msg = JSON.parse(e.data);
        if (msg.id && pending.has(msg.id)) {
            const p = pending.get(msg.id);
            pending.delete(msg.id);
            msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
        }
    };

    await new Promise(r => ws.onopen = r);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile: false
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

    const errors = [];
    const failedUrls = [];
    ws.addEventListener('message', e => {
        const msg = JSON.parse(e.data);
        if (msg.method === 'Runtime.exceptionThrown') {
            errors.push(msg.params.exceptionDetails.text + ': ' + (msg.params.exceptionDetails.exception?.description || '').slice(0, 200));
        }
        if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
            errors.push(msg.params.entry.text.slice(0, 200));
        }
        if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
            failedUrls.push(msg.params.response.status + ' ' + msg.params.response.url.slice(0, 120));
        }
    });
    await send('Log.enable');
    await send('Network.enable');

    await send('Page.navigate', { url });
    await new Promise(r => setTimeout(r, 5000));

    const { result } = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });

    console.log('\n=== Mobile probe @ ' + width + 'x' + height + ' ===');
    console.log('href:', result.value.href);
    console.log('viewport meta:', result.value.viewportMeta);
    console.log('viewport:', result.value.innerWidth, '| scrollWidth:', result.value.scrollWidth,
        result.value.scrollWidth > result.value.innerWidth ? '  <-- HORIZONTAL OVERFLOW' : '  (ok)');
    console.log('pointer: coarse ->', result.value.pointerCoarse);
    if (result.value.overflow.length) {
        console.log('OVERFLOWING ELEMENTS:');
        result.value.overflow.forEach(o => console.log('  ' + o.el + '  left=' + o.left + ' right=' + o.right + ' w=' + o.w));
    } else {
        console.log('overflow: none');
    }
    if (result.value.smallTargets.length) {
        console.log('TARGETS < 44px:');
        result.value.smallTargets.forEach(t => console.log('  ' + t.el + '  ' + t.w + 'x' + t.h));
    } else {
        console.log('touch targets: all >= 44px');
    }
    if (errors.length) {
        console.log('CONSOLE ERRORS:');
        errors.slice(0, 5).forEach(e => console.log('  ' + e));
    } else {
        console.log('console errors: none');
    }
    if (failedUrls.length) {
        console.log('FAILED REQUESTS:');
        failedUrls.slice(0, 5).forEach(u => console.log('  ' + u));
    } else {
        console.log('failed requests: none');
    }

    ws.close();
    edge.kill();
}

main().catch(e => { console.error(e); process.exit(1); });
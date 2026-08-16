// Generates the PWA icons (no external dependencies — pure Node).
// Run:  node scripts/gen-icons.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
    let table = crc32.table;
    if (!table) {
        table = crc32.table = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c;
        }
    }
    let crc = -1;
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0;
        rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function render(size, padding) {
    const buf = Buffer.alloc(size * size * 4);
    const s = size * (1 - 2 * padding);
    const o = size * padding;
    const seg1 = [0.28, 0.52, 0.45, 0.69];
    const seg2 = [0.45, 0.69, 0.76, 0.33];
    const half = 0.065 * s;
    const scale = (u, v) => [o + u * s, o + v * s];
    const [ax, ay] = scale(seg1[0], seg1[1]);
    const [bx, by] = scale(seg1[2], seg1[3]);
    const [cx, cy] = scale(seg2[0], seg2[1]);
    const [dx, dy] = scale(seg2[2], seg2[3]);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const t = y / size;
            let r = 0x1e + (0x4c - 0x1e) * t;
            let g = 0x1b + (0x1d - 0x1b) * t;
            let b = 0x4b + (0x95 - 0x4b) * t;
            const px = x + 0.5, py = y + 0.5;
            const d = Math.min(distToSegment(px, py, ax, ay, bx, by), distToSegment(px, py, cx, cy, dx, dy));
            if (d < half) {
                const glow = Math.max(0, 1 - d / half);
                r = 255; g = 255; b = 160 + 95 * glow;
            }
            buf[i] = Math.round(r);
            buf[i + 1] = Math.round(g);
            buf[i + 2] = Math.round(b);
            buf[i + 3] = 255;
        }
    }
    return buf;
}

const dir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(dir, { recursive: true });
for (const [size, pad, name] of [
    [192, 0, 'icon-192.png'],
    [512, 0, 'icon-512.png'],
    [512, 0.1, 'icon-512-maskable.png']
]) {
    fs.writeFileSync(path.join(dir, name), encodePNG(size, size, render(size, pad)));
    console.log('wrote', name);
}
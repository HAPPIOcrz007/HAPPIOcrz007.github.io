/* exam_js/zip.js — minimal ZIP writer/reader (no dependencies) so the question paper ships as ONE .zip.

   paper.zip
     ├─ manifest.json   title, paper id, created time (plain text, so you can see which paper it is)
     └─ paper.exam      the encrypted paper (see crypto.js) — nothing readable inside

   Writing uses "stored" entries (the payload is already compressed + encrypted, so deflate gains nothing).
   Reading understands stored and deflate entries, so a re-zipped file still opens. */

import { CryptoError } from './crypto.js';

const te = new TextEncoder();
const td = new TextDecoder();

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** entries: [{ name, data: Uint8Array }] → Uint8Array (a valid .zip) */
export function makeZip(entries, when = new Date()) {
  const time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const date = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const name = te.encode(e.name), crc = crc32(e.data), size = e.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, e.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

async function inflateRaw(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** bytes → [{ name, data }] */
export async function readZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new CryptoError('This is not a valid zip file.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new CryptoError('The zip file is damaged.');
    const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = td.decode(bytes.subarray(p + 46, p + 46 + nlen));
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    const raw = bytes.subarray(start, start + csize);
    const data = method === 0 ? raw.slice() : method === 8 ? await inflateRaw(raw) : null;
    if (!data) throw new CryptoError('This zip uses an unsupported compression method.');
    if (crc32(data) !== crc) throw new CryptoError(`The zip file is damaged (${name}).`);
    out.push({ name, data });
    p += 46 + nlen + elen + clen;
  }
  return out;
}

/** The encrypted paper object → bytes of paper.zip */
export function packPaperZip(file) {
  const manifest = {
    app: 'exam-tool', version: 1, paperId: file.paperId, title: file.title, createdAt: file.createdAt,
    note: 'Encrypted exam paper. Open it on the exam tool’s Answer page with the answerer key.',
  };
  return makeZip([
    { name: 'manifest.json', data: te.encode(JSON.stringify(manifest, null, 2)) },
    { name: 'paper.exam', data: te.encode(JSON.stringify(file)) },
  ]);
}

/** Bytes of a paper.zip (or of a bare .exam file) → the paper JSON text that crypto.js opens. */
export async function readPaperBytes(bytes) {
  if (bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4B) {
    const entry = (await readZip(bytes)).find((e) => e.name === 'paper.exam' || e.name.endsWith('.exam'));
    if (!entry) throw new CryptoError('This zip does not contain an exam paper.');
    return td.decode(entry.data);
  }
  return td.decode(bytes);
}

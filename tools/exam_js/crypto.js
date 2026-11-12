/* exam_js/crypto.js — all encryption for the exam tool. Browser Web Crypto only, no dependencies.

   KEYS (made fresh every time a paper is generated)
   · setterKey    "SK1-…"        ECDH P-256 private key (PKCS8). Opens answer files and the
                                 whole paper (incl. correct answers). Keep it secret.
   · answererKey  "ABCDE-FGHJK-…" 100-bit random passphrase. Opens the questions only.
   · pub                         matching public key, stored INSIDE the paper file. Answerers use
                                 it to encrypt their answers so only the setter can read them.

   PAPER FILE (.exam, JSON)
     body = AES-GCM(K, gzip(paper))                 K = random 256-bit paper key
     kw   = AES-GCM(PBKDF2(answererKey), K)          answerer route to K
     ks   = ECIES(pub, K)                            setter route to K
     sol  = ECIES(pub, gzip(solutions))              correct answers: setter-only, never in the
                                                     answerer's reach
   ANSWER FILE (.ans, JSON)
     sealed = ECIES(pub, gzip(payload))              identity + answers; only setterKey opens it

   ECIES = ephemeral ECDH P-256 → HKDF-SHA256 → AES-256-GCM. Every box is bound to the paper id
   and its role through GCM additional data, so boxes can't be swapped between files/papers. */

const te = new TextEncoder();
const td = new TextDecoder();
const subtle = globalThis.crypto.subtle;
const rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export const MAGIC = 'EXAMSEC';
export const FORMAT_VERSION = 1;
export const KDF_ITERATIONS = 600000;
const CURVE = { name: 'ECDH', namedCurve: 'P-256' };
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no I/O/0/1

export class CryptoError extends Error {
  constructor(message) { super(message); this.name = 'CryptoError'; }
}

/* ---------- base64url + gzip ---------- */
export function b64uEnc(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64uDec(str) {
  try {
    let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    s += '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { throw new CryptoError('File is damaged (bad encoding).'); }
}
async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
const gzip = (bytes) => pipe(bytes, new CompressionStream('gzip'));
const gunzip = (bytes) => pipe(bytes, new DecompressionStream('gzip'));
const packJson = (obj) => gzip(te.encode(JSON.stringify(obj)));
const unpackJson = async (bytes) => JSON.parse(td.decode(await gunzip(bytes)));

/* ---------- AES-GCM ---------- */
const aad = (paperId, role) => te.encode(`${paperId}|${role}`);
const aesRaw = (raw) => subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

async function aesSeal(key, plain, additional) {
  const iv = rand(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additional }, key, plain);
  return { iv: b64uEnc(iv), ct: b64uEnc(ct) };
}
async function aesOpen(key, box, additional) {
  try {
    const pt = await subtle.decrypt(
      { name: 'AES-GCM', iv: b64uDec(box.iv), additionalData: additional }, key, b64uDec(box.ct));
    return new Uint8Array(pt);
  } catch (e) {
    if (e instanceof CryptoError) throw e;
    throw new CryptoError('Wrong key, or the file has been changed or damaged.');
  }
}

/* ---------- ECIES (P-256 + HKDF + AES-GCM) ---------- */
async function wrapKeyFrom(priv, pub, salt) {
  const bits = await subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256);
  const hk = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: te.encode('exam-seal-v1') },
    hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const importPub = (b64) =>
  subtle.importKey('raw', b64uDec(b64), CURVE, false, []).catch(() => {
    throw new CryptoError('File is damaged (bad public key).');
  });

async function eciesSeal(pubB64, plain, additional) {
  const pub = await importPub(pubB64);
  const eph = await subtle.generateKey(CURVE, true, ['deriveBits']);
  const epkRaw = new Uint8Array(await subtle.exportKey('raw', eph.publicKey));
  const key = await wrapKeyFrom(eph.privateKey, pub, epkRaw);
  return { epk: b64uEnc(epkRaw), ...(await aesSeal(key, plain, additional)) };
}
async function eciesOpen(priv, box, additional) {
  const epk = await importPub(box.epk);
  const key = await wrapKeyFrom(priv, epk, b64uDec(box.epk));
  return aesOpen(key, box, additional);
}

/* ---------- key handling ---------- */
export function generateAnswererKey() {
  const raw = rand(20);
  let s = '';
  for (const byte of raw) s += KEY_ALPHABET[byte & 31]; // 256 % 32 === 0 → unbiased
  return s.match(/.{5}/g).join('-');
}
/* Tolerant of case, spaces and dashes when a student types the key. */
export function normalizeAnswererKey(key) {
  return String(key || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
async function passwordKey(answererKey, salt, iterations) {
  const norm = normalizeAnswererKey(answererKey);
  if (norm.length < 10) throw new CryptoError('That answerer key looks too short.');
  const base = await subtle.importKey('raw', te.encode(norm), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function importSetterKey(setterKey) {
  const s = String(setterKey || '').trim();
  if (!s.startsWith('SK1-')) throw new CryptoError('That is not a setter key (it should start with SK1-).');
  try {
    return await subtle.importKey('pkcs8', b64uDec(s.slice(4)), CURVE, false, ['deriveBits']);
  } catch { throw new CryptoError('The setter key is incomplete or damaged.'); }
}

/* ---------- containers ---------- */
function parseContainer(input, kind) {
  let f = input;
  if (typeof input === 'string') {
    try { f = JSON.parse(input); } catch { throw new CryptoError('This is not a valid exam file.'); }
  }
  if (!f || f.magic !== MAGIC) throw new CryptoError('This is not an exam tool file.');
  if (f.v !== FORMAT_VERSION) throw new CryptoError(`Unsupported file version (${f.v}).`);
  if (f.kind !== kind) throw new CryptoError(`Expected a ${kind} file but got a ${f.kind} file.`);
  if (!f.paperId) throw new CryptoError('File is damaged (no paper id).');
  return f;
}

/** Cheap, key-free look at a file: { kind, paperId, title, createdAt|submittedAt }. */
export function peekFile(input) {
  let f = input;
  if (typeof input === 'string') {
    try { f = JSON.parse(input); } catch { throw new CryptoError('This is not a valid exam file.'); }
  }
  if (!f || f.magic !== MAGIC) throw new CryptoError('This is not an exam tool file.');
  return { kind: f.kind, paperId: f.paperId, title: f.title || '', createdAt: f.createdAt, submittedAt: f.submittedAt };
}

/* ================= PAPER ================= */

/** Encrypt a paper. `paper.id` is required. Returns the file object and BOTH keys — show them once. */
export async function createPaperFile(paper, solutions) {
  if (!paper || !paper.id) throw new CryptoError('Paper needs an id before it can be generated.');
  const id = paper.id;

  const pair = await subtle.generateKey(CURVE, true, ['deriveBits']);
  const pub = b64uEnc(await subtle.exportKey('raw', pair.publicKey));
  const setterKey = 'SK1-' + b64uEnc(await subtle.exportKey('pkcs8', pair.privateKey));
  const answererKey = generateAnswererKey();

  const K = rand(32);
  const salt = rand(16);
  const body = await aesSeal(await aesRaw(K), await packJson(paper), aad(id, 'body'));
  const kw = await aesSeal(await passwordKey(answererKey, salt, KDF_ITERATIONS), K, aad(id, 'kw'));
  const ks = await eciesSeal(pub, K, aad(id, 'ks'));
  const sol = await eciesSeal(pub, await packJson(solutions || {}), aad(id, 'sol'));

  const file = {
    magic: MAGIC, kind: 'paper', v: FORMAT_VERSION,
    paperId: id, title: paper.title || '', createdAt: new Date().toISOString(),
    pub, kdf: { salt: b64uEnc(salt), iter: KDF_ITERATIONS }, kw, ks, body, sol,
  };
  return { file, setterKey, answererKey };
}

async function paperKeyViaAnswerer(f, answererKey) {
  const key = await passwordKey(answererKey, b64uDec(f.kdf.salt), f.kdf.iter);
  return aesOpen(key, f.kw, aad(f.paperId, 'kw'))
    .catch(() => { throw new CryptoError('Wrong answerer key.'); });
}
async function readBody(f, K) {
  return unpackJson(await aesOpen(await aesRaw(K), f.body, aad(f.paperId, 'body')));
}

/** Answerer route: returns { paper, pub, paperId }. No correct answers in here. */
export async function openPaperAsAnswerer(input, answererKey) {
  const f = parseContainer(input, 'paper');
  const K = await paperKeyViaAnswerer(f, answererKey);
  return { paper: await readBody(f, K), pub: f.pub, paperId: f.paperId };
}

/** Setter route: returns { paper, solutions, pub, paperId }. */
export async function openPaperAsSetter(input, setterKey) {
  const f = parseContainer(input, 'paper');
  const priv = await importSetterKey(setterKey);
  const K = await eciesOpen(priv, f.ks, aad(f.paperId, 'ks'));
  const solutions = await unpackJson(await eciesOpen(priv, f.sol, aad(f.paperId, 'sol')));
  return { paper: await readBody(f, K), solutions, pub: f.pub, paperId: f.paperId };
}

/* ================= ANSWERS ================= */

/** Encrypt a submission to the paper's public key. payload = { paperId, submittedAt, identity, answers, meta }. */
export async function createAnswerFile(pub, payload) {
  if (!payload || !payload.paperId) throw new CryptoError('Answer payload needs a paperId.');
  const sealed = await eciesSeal(pub, await packJson(payload), aad(payload.paperId, 'ans'));
  return {
    magic: MAGIC, kind: 'answer', v: FORMAT_VERSION,
    paperId: payload.paperId, submittedAt: payload.submittedAt, sealed,
  };
}

/** Setter opens one answer file. Pass `expectPaperId` to reject files from a different paper. */
export async function openAnswerFile(input, setterKey, expectPaperId) {
  const f = parseContainer(input, 'answer');
  if (expectPaperId && f.paperId !== expectPaperId) {
    throw new CryptoError('This answer file belongs to a different paper.');
  }
  const priv = await importSetterKey(setterKey);
  const payload = await unpackJson(await eciesOpen(priv, f.sealed, aad(f.paperId, 'ans')));
  if (payload.paperId !== f.paperId) throw new CryptoError('Answer file is inconsistent (paper id mismatch).');
  return payload;
}

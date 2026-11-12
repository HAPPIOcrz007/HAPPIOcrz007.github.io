/* exam_js/images.js — images uploaded by the setter.
   Images are kept in paper.assets { i1: 'data:image/jpeg;base64,…' } and referenced in markdown as
   ![alt](img:i1)  or  ![alt|60%](img:i1)  /  ![alt|320](img:i1)  (width in % or px).
   They travel inside the encrypted paper, so no external hosting is needed. */

const OK_TYPES = /^image\/(png|jpeg|webp|gif)$/;
export const MAX_SIDE = 1600;

const readDataUrl = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(new Error('Could not read that file.'));
  r.readAsDataURL(file);
});

/** File → data URI, shrunk to ≤1600 px and recompressed (small PNGs and GIFs are kept as they are). */
export async function compressImage(file) {
  if (!OK_TYPES.test(file.type)) throw new Error('Use a PNG, JPEG, WebP or GIF image.');
  const url = await readDataUrl(file);
  if (file.type === 'image/gif') {
    if (file.size > 1.5 * 1024 * 1024) throw new Error('That GIF is over 1.5 MB — use a smaller one.');
    return url;
  }
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Could not decode that image.'));
    i.src = url;
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && file.size < 350 * 1024) return url;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'white';                      // JPEG has no transparency
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

export function nextAssetId(assets) {
  let n = Object.keys(assets).length + 1;
  while (('i' + n) in assets) n++;
  return 'i' + n;
}
export const dataUriBytes = (u) => Math.round(String(u).length * 0.75);
export const totalAssetBytes = (assets) => Object.values(assets || {}).reduce((s, u) => s + dataUriBytes(u), 0);

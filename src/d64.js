/*
 * C64-emulator — D64-diskbilde (katalog og filer)
 * SPDX-License-Identifier: GPL-2.0-or-later
 *
 * Copyright (C) 2026 John Werner Enoksen <john@enoksen.no>
 * Utviklet med hjelp av Claude (Anthropic).
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 */
// ---- D64 disk image parser ----
function parseD64(img) {
  if (img.length < 174848) throw new Error('ikke en D64-fil');
  const spt = t => t <= 17 ? 21 : t <= 24 ? 19 : t <= 30 ? 18 : 17;
  const off = (t, s) => { let o = 0; for (let i = 1; i < t; i++) o += spt(i); return (o + s) * 256; };
  const ok = (t, s) => t >= 1 && t <= 40 && s < spt(Math.min(t, 35)) && off(t, s) + 256 <= img.length;
  const strip = b => { const r = [...b]; while (r.length && r[r.length - 1] === 0xa0) r.pop(); return r; };
  const bam = off(18, 0);
  const name = strip(img.subarray(bam + 0x90, bam + 0xa0));
  const id = [...img.subarray(bam + 0xa2, bam + 0xa7)].map(b => b === 0xa0 ? 0x20 : b);
  let free = 0; for (let t = 1; t <= 35; t++) if (t !== 18) free += img[bam + 4 * t];
  const files = [], seen = new Set();
  let t = 18, s = 1;
  while (t && ok(t, s) && !seen.has(t * 64 + s)) {
    seen.add(t * 64 + s); const o = off(t, s);
    for (let e = 0; e < 8; e++) {
      const eo = o + e * 32, typ = img[eo + 2];
      if (!(typ & 0x80)) continue;
      const data = []; let ft = img[eo + 3], fs = img[eo + 4], guard = 0;
      while (ft && ok(ft, fs) && guard++ < 800) {
        const so = off(ft, fs), nt = img[so], ns = img[so + 1];
        if (nt === 0) { for (let i = 2; i <= ns && i < 256; i++) data.push(img[so + i]); }
        else for (let i = 2; i < 256; i++) data.push(img[so + i]);
        ft = nt; fs = ns;
      }
      files.push({ name: strip(img.subarray(eo + 5, eo + 21)), type: typ & 7, blocks: img[eo + 30] | (img[eo + 31] << 8), data: Uint8Array.from(data) });
    }
    t = img[o]; s = img[o + 1];
  }
  return { name, id, free, files };
}

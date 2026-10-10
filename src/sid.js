/*
 * C64 emulator — MOS 6581 SID sound chip
 * SPDX-License-Identifier: GPL-2.0-or-later
 *
 * Copyright (C) 2026 John Werner Enoksen <john@enoksen.no>
 * Developed with the help of Claude (Anthropic).
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
// ---- SID 6581 (sample-based: 3 voices, ADSR, ring/sync, multimode filter) ----
const SID_RATE = [9,32,63,95,149,220,267,313,392,977,1954,3126,3907,11720,19532,31251];
class SID {
  constructor(sr) { this.setRate(sr || 44100); this.reset(); }
  setRate(sr) { this.sr = sr; this.cps = 985248 / sr; this.fcKey = -1; }
  reset() {
    this.regs = new Uint8Array(32);
    this.v = [0,1,2].map(() => ({ acc: 0, noise: 0x7ffff8, env: 0, state: 3, rc: 0, gate: 0 }));
    this.lp = 0; this.bp = 0; this.cyc = 0; this.osc3 = 0;
    this.xPrev = 0; this.yPrev = 0;
    this.buf = new Float32Array(8192); this.n = 0; this.fcKey = -1; this.fCoef = 0; this.wrapped = [false, false, false];
  }
  write(r, v) {
    if (r > 0x18) return;
    this.regs[r] = v;
    if (r === 4 || r === 11 || r === 18) {
      const vo = this.v[(r - 4) / 7], g = v & 1;
      if (g && !vo.gate) vo.state = 0; else if (!g && vo.gate) vo.state = 3;
      vo.gate = g;
      if (v & 8) { vo.acc = 0; vo.noise = 0x7ffff8; }
    }
  }
  read(r) { return r === 0x1b ? this.osc3 : r === 0x1c ? this.v[2].env : 0; }
  clock(c) { this.cyc += c; while (this.cyc >= this.cps) { this.cyc -= this.cps; this.sample(); } }
  wave(i) {
    const R = this.regs, ctrl = R[i * 7 + 4], a = Math.floor(this.v[i].acc);
    if (!(ctrl & 0xf0)) return 0;
    let out = 0xfff;
    if (ctrl & 0x10) {
      let msb = a & 0x800000;
      if (ctrl & 4) msb ^= Math.floor(this.v[(i + 2) % 3].acc) & 0x800000;
      out &= ((msb ? ~a : a) >> 11) & 0xfff;
    }
    if (ctrl & 0x20) out &= a >> 12;
    if (ctrl & 0x40) { const pw = R[i * 7 + 2] | ((R[i * 7 + 3] & 15) << 8); out &= ((a >> 12) >= pw || (ctrl & 8)) ? 0xfff : 0; }
    if (ctrl & 0x80) { const n = this.v[i].noise;
      out &= (((n >> 20) & 1) << 11) | (((n >> 18) & 1) << 10) | (((n >> 14) & 1) << 9) | (((n >> 11) & 1) << 8) |
             (((n >> 9) & 1) << 7) | (((n >> 5) & 1) << 6) | (((n >> 2) & 1) << 5) | ((n & 1) << 4); }
    return out;
  }
  envelope(i) {
    const R = this.regs, vo = this.v[i], ad = R[i * 7 + 5], sr = R[i * 7 + 6];
    vo.rc += this.cps;
    for (let guard = 0; guard < 64; guard++) {
      let p;
      if (vo.state === 0) p = SID_RATE[ad >> 4];
      else {
        p = SID_RATE[vo.state === 1 ? ad & 15 : sr & 15];
        const e = vo.env; p *= e >= 93 ? 1 : e >= 54 ? 2 : e >= 26 ? 4 : e >= 14 ? 8 : e >= 6 ? 16 : 30;
      }
      if (vo.rc < p) break;
      vo.rc -= p;
      if (vo.state === 0) { if (++vo.env >= 255) { vo.env = 255; vo.state = 1; } }
      else if (vo.state === 1) { if (vo.env > (sr >> 4) * 17) vo.env--; }
      else if (vo.env > 0) vo.env--;
    }
  }
  sample() {
    const R = this.regs, d = this.cps, wrapped = this.wrapped; wrapped[0] = wrapped[1] = wrapped[2] = false;
    for (let i = 0; i < 3; i++) {
      const vo = this.v[i], ctrl = R[i * 7 + 4];
      if (ctrl & 8) continue;
      const freq = R[i * 7] | (R[i * 7 + 1] << 8), old = vo.acc, nw = old + freq * d;
      let e = Math.floor((nw - 0x80000) / 0x100000) - Math.floor((old - 0x80000) / 0x100000);
      while (e-- > 0) { const b = ((vo.noise >> 22) ^ (vo.noise >> 17)) & 1; vo.noise = ((vo.noise << 1) | b) & 0x7fffff; }
      wrapped[i] = nw >= 0x1000000; vo.acc = nw % 0x1000000;
    }
    for (let i = 0; i < 3; i++) if ((R[i * 7 + 4] & 2) && wrapped[(i + 2) % 3]) this.v[i].acc = 0;
    const route = R[0x17], mode = R[0x18], vol = mode & 15;
    let direct = 0, filt = 0;
    for (let i = 0; i < 3; i++) {
      const vo = this.v[i];
      if (vo.env === 0 && vo.state === 3 && i !== 2) continue; // silent voice
      this.envelope(i);
      const w = this.wave(i);
      if (i === 2) this.osc3 = w >> 4;
      const o = (w - 2048) * this.v[i].env / 255;
      if (route & (1 << i)) filt += o;
      else if (!(i === 2 && (mode & 0x80))) direct += o;
    }
    // Chamberlin state-variable filter, 2x oversampled
    const fcReg = (R[0x15] & 7) | (R[0x16] << 3);
    if (fcReg !== this.fcKey) { this.fcKey = fcReg; this.fCoef = 2 * Math.sin(Math.PI * (30 + fcReg * 5.8) / (this.sr * 2)); }
    const f = this.fCoef;
    const q = 1.4 - (route >> 4) * 0.075;
    let hp = 0;
    for (let k = 0; k < 2; k++) { hp = filt - this.lp - q * this.bp; this.bp += f * hp; this.lp += f * this.bp; }
    let fo = 0;
    if (mode & 0x10) fo += this.lp; if (mode & 0x20) fo += this.bp; if (mode & 0x40) fo += hp;
    // volume register DC offset (gives the classic $D418 digi trick) + DC blocker
    const x = ((direct + fo) / 6144 * 0.7 + 0.12) * vol / 15;
    const y = x - this.xPrev + 0.995 * this.yPrev; this.xPrev = x; this.yPrev = y;
    if (this.n < this.buf.length) this.buf[this.n++] = y;
  }
}

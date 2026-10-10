/*
 * C64-emulator — Commodore 1541: VIA 6522, GCR, diskmekanikk
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
// ---- MOS 6522 VIA ----
class VIA {
  constructor() { this.reset(); }
  reset() {
    this.ora = 0; this.orb = 0; this.ddra = 0; this.ddrb = 0;
    this.t1c = 0xffff; this.t1l = 0xffff; this.t2c = 0xffff; this.t2l = 0xff; this.t1armed = false; this.t2armed = false;
    this.acr = 0; this.pcr = 0; this.ifr = 0; this.ier = 0; this.sr = 0;
    this.ca1 = 0; this.cb1 = 0; this.t2load = false;
    this.inA = () => 0xff; this.inB = () => 0xff; this.onWriteB = null; this.onWriteA = null;
  }
  get irq() { return (this.ifr & this.ier & 0x7f) !== 0; }
  tick() {
    // T1: decrements every cycle; underflow sets IFR6, free-run reloads from latch
    if (--this.t1c < 0) {
      if (this.t1armed || (this.acr & 0x40)) { this.ifr |= 0x40; if (!(this.acr & 0x40)) this.t1armed = false; }
      this.t1c = (this.acr & 0x40) ? this.t1l : 0xffff;
    }
    if (!(this.acr & 0x20)) {
      if (--this.t2c < 0) { if (this.t2armed) { this.ifr |= 0x20; this.t2armed = false; } this.t2c = 0xffff; }
    }
  }
  setCA1(v) {
    if (v === this.ca1) return;
    const pos = (this.pcr & 1) !== 0;
    if ((pos && v) || (!pos && !v)) this.ifr |= 0x02;
    this.ca1 = v;
  }
  ca2High() { return (this.pcr & 0x0e) === 0x0e || (this.pcr & 0x0e) === 0x0a; } // manual high (or pulse idle)
  cb2Low() { return (this.pcr & 0xe0) === 0xc0; }
  read(r) {
    switch (r & 15) {
      case 0: this.ifr &= ~0x18; return (this.orb & this.ddrb) | (this.inB() & ~this.ddrb);
      case 1: this.ifr &= ~0x03; return (this.ora & this.ddra) | (this.inA() & ~this.ddra);
      case 2: return this.ddrb; case 3: return this.ddra;
      case 4: this.ifr &= ~0x40; return this.t1c & 255;
      case 5: return (this.t1c >> 8) & 255;
      case 6: return this.t1l & 255; case 7: return (this.t1l >> 8) & 255;
      case 8: this.ifr &= ~0x20; return this.t2c & 255;
      case 9: return (this.t2c >> 8) & 255;
      case 10: return this.sr; case 11: return this.acr; case 12: return this.pcr;
      case 13: return (this.ifr & 0x7f) | (this.irq ? 0x80 : 0);
      case 14: return this.ier | 0x80;
      case 15: return (this.ora & this.ddra) | (this.inA() & ~this.ddra);
    }
  }
  write(r, v) {
    switch (r & 15) {
      case 0: this.orb = v; this.ifr &= ~0x18; if (this.onWriteB) this.onWriteB(); break;
      case 1: this.ora = v; this.ifr &= ~0x03; if (this.onWriteA) this.onWriteA(); break;
      case 2: this.ddrb = v; if (this.onWriteB) this.onWriteB(); break;
      case 3: this.ddra = v; break;
      case 4: case 6: this.t1l = (this.t1l & 0xff00) | v; break;
      case 5: this.t1l = (this.t1l & 0xff) | (v << 8); this.t1c = this.t1l + 1; this.ifr &= ~0x40; this.t1armed = true; break;
      case 7: this.t1l = (this.t1l & 0xff) | (v << 8); this.ifr &= ~0x40; break;
      case 8: this.t2l = v; break;
      case 9: this.t2c = this.t2l | (v << 8); this.t2c++; this.ifr &= ~0x20; this.t2armed = true; break;
      case 10: this.sr = v; break;
      case 11: this.acr = v; break;
      case 12: this.pcr = v; break;
      case 13: this.ifr &= ~v; break;
      case 14: if (v & 0x80) this.ier |= v & 0x7f; else this.ier &= ~v; break;
      case 15: this.ora = v; if (this.onWriteA) this.onWriteA(); break;
    }
  }
}

// ---- GCR encoding of D64 images ----
const GCR = [0x0a,0x0b,0x12,0x13,0x0e,0x0f,0x16,0x17,0x09,0x19,0x1a,0x1b,0x0d,0x1d,0x1e,0x15];
const GCR_DEC = new Int8Array(32).fill(-1); GCR.forEach((g, i) => GCR_DEC[g] = i);
const SPT = t => t <= 17 ? 21 : t <= 24 ? 19 : t <= 30 ? 18 : 17;
const TRACK_LEN = t => t <= 17 ? 7692 : t <= 24 ? 7142 : t <= 30 ? 6666 : 6250;
const D64_OFF = (t, s) => { let o = 0; for (let i = 1; i < t; i++) o += SPT(i); return (o + s) * 256; };
function gcrEncode(bytes) { // length multiple of 4
  const out = [];
  for (let i = 0; i < bytes.length; i += 4) {
    let bits = 0n;
    for (let k = 0; k < 4; k++) bits = (bits << 10n) | BigInt((GCR[bytes[i + k] >> 4] << 5) | GCR[bytes[i + k] & 15]);
    for (let k = 4; k >= 0; k--) out.push(Number((bits >> BigInt(k * 8)) & 0xffn));
  }
  return out;
}
function gcrDecode5(g, o) { // 5 GCR bytes at g[o..] -> 4 bytes, or null on bad code
  let bits = 0n; for (let k = 0; k < 5; k++) bits = (bits << 8n) | BigInt(g[(o + k) % g.length]);
  const out = [];
  for (let k = 3; k >= 0; k--) {
    const v = Number((bits >> BigInt(k * 10)) & 0x3ffn), hi = GCR_DEC[v >> 5], lo = GCR_DEC[v & 31];
    if (hi < 0 || lo < 0) return null;
    out.push((hi << 4) | lo);
  }
  return out;
}
function d64ToGcr(img) {
  const tracks = [];
  const bam = D64_OFF(18, 0), id1 = img[bam + 0xa2], id2 = img[bam + 0xa3];
  const maxT = img.length >= 196608 ? 40 : 35;
  for (let t = 1; t <= 42; t++) {
    const len = TRACK_LEN(Math.min(t, 35)), tr = new Uint8Array(len).fill(0x55);
    if (t <= maxT) {
      const n = SPT(t), per = Math.floor(len / n); let p = 0;
      for (let s = 0; s < n; s++) {
        p = s * per;
        const put = a => { for (const b of a) tr[p++ % len] = b; };
        put([0xff, 0xff, 0xff, 0xff, 0xff]);
        put(gcrEncode([0x08, s ^ t ^ id2 ^ id1, s, t, id2, id1, 0x0f, 0x0f]));
        put(new Array(9).fill(0x55));
        put([0xff, 0xff, 0xff, 0xff, 0xff]);
        const data = img.subarray(D64_OFF(t, s), D64_OFF(t, s) + 256);
        let ck = 0; for (const b of data) ck ^= b;
        put(gcrEncode([0x07, ...data, ck, 0, 0]));
      }
    }
    tracks.push(tr);
  }
  return tracks;
}
// Rebuild a D64 from (possibly written) GCR tracks; sectors that can't be read keep the original data
function gcrToD64(tracks, orig) {
  const img = Uint8Array.from(orig.subarray(0, 174848));
  for (let t = 1; t <= 35; t++) {
    const g = tracks[t - 1], len = g.length;
    for (let i = 0; i < len; i++) {
      if (g[i] !== 0xff || g[(i + 1) % len] === 0xff) continue; // end of a sync mark
      const h = gcrDecode5(g, i + 1); if (!h || h[0] !== 0x08) continue;
      const s = h[2]; if (h[3] !== t || s >= SPT(t)) continue;
      // find the data block sync after the header
      let j = i + 11; while (j < i + 60 && g[j % len] !== 0xff) j++;
      while (j < i + 80 && g[j % len] === 0xff) j++;
      const raw = []; let ok = true;
      for (let k = 0; k < 65 && ok; k++) { const d = gcrDecode5(g, j + k * 5); if (!d) ok = false; else raw.push(...d); }
      if (!ok || raw[0] !== 0x07) continue;
      img.set(raw.slice(1, 257), D64_OFF(t, s));
    }
  }
  return img;
}

// ---- The 1541 itself ----
function make1541(rom) {
  const ram = new Uint8Array(2048);
  const via1 = new VIA(), via2 = new VIA();
  const d = { time: 0, via1, via2, ram, tracks: null, img: null, dirty: false, halftrack: 36, pos: 0, byteTimer: 0,
    sync: false, lastByte: 0, led: false, motor: false, bus: null };
  function cycle() {
    d.time++;
    // apply C64-side bus changes that are due at this drive cycle (time-stamped history, see advanceTo)
    while (qHead < qT.length && qT[qHead] <= d.time) applyC64(qV[qHead++]);
    if (qHead > 64 && qHead === qT.length) { qT.length = qV.length = 0; qHead = 0; }
    via1.tick(); via2.tick();
    if (!d.motor || !d.tracks) return;
    const zone = (via2.orb >> 5) & 3, cpb = 32 - zone * 2;
    if (++d.byteTimer < cpb) return;
    d.byteTimer = 0;
    const tr = (d.halftrack & 1) ? null : d.tracks[(d.halftrack >> 1) - 1];
    if (!tr) { d.sync = false; return; }
    if (d.pos >= tr.length) d.pos = 0;
    if (via2.cb2Low()) { // write mode: the byte in PA goes to the disk
      tr[d.pos] = (via2.ora & via2.ddra) | (~via2.ddra & 0xff); d.dirty = true; d.sync = false;
    } else {
      const b = tr[d.pos];
      d.sync = b === 0xff && d.lastByte === 0xff;
      d.lastByte = b; d.readByte = b;
    }
    d.pos++;
    if (!d.sync) { // BYTE READY: CA1 flag and the CPU's SO pin
      via2.ifr |= 0x02;
      if (via2.ca2High()) active.V = 1;
    }
  }
  const rd = a => {
    cycle();
    if (a < 0x1800) return ram[a & 0x7ff];
    if (a < 0x1c00) return via1.read(a);
    if (a < 0x2000) return via2.read(a);
    if (a >= 0xc000) return rom[a - 0xc000];
    return a >> 8;
  };
  const wr = (a, v) => {
    cycle();
    if (a < 0x1800) ram[a & 0x7ff] = v;
    else if (a < 0x1c00) via1.write(a, v);
    else if (a < 0x2000) via2.write(a, v);
  };
  // ---- Scheduling against the C64 ----
  // The drive sees the C64 side of the IEC bus through a time-stamped queue (qT/qV), so its reads of
  // VIA1 and the ATN edge on CA1 are exact for its own clock even when it runs a little behind the C64.
  // Two cores share the drive state:
  //  - gcpu (generator) runs one bus cycle per tick, in lockstep with the C64. Used while the bus is active.
  //  - fcpu runs whole instructions. Used when the bus has been quiet for QUIET cycles; the drive then
  //    trails the C64 by 0-7 cycles. All reads stay exact; the only approximation is that the first
  //    drive-initiated bus write after a quiet period can reach the C64 up to 7 cycles late.
  const gcpu = makeCPUGen(rd, wr), fcpu = makeCPU(rd, wr);
  gcpu.irq = fcpu.irq = () => via1.irq || via2.irq;
  const REGS = ['A','X','Y','S','PC','C','Z','I','D','V','N','nmiPending','ip1','ip2','np1','np2','jammed'];
  const copy = (a, b) => { for (let i = 0; i < REGS.length; i++) b[REGS[i]] = a[REGS[i]]; };
  let active = gcpu, gen = null, c64v = 0;
  const qT = [], qV = []; let qHead = 0;
  const QUIET = 400, MAXLEN = 8;
  d.lastBus = 0; d.fastCycles = 0; d.fast = false;
  Object.defineProperty(d, 'cpu', { get: () => active });
  function applyC64(v) {           // v: C64 CIA2 port A bits 3 (ATN), 4 (CLK), 5 (DATA); 1 = pulled low
    const atnChanged = ((v ^ c64v) & 8) !== 0; c64v = v;
    if (atnChanged) via1.setCA1(v & 8 ? 1 : 0);
  }
  d.c64Bus = (v, t) => { qT.push(t); qV.push(v); if (t > d.lastBus) d.lastBus = t; };
  const quiet = () => d.time - d.lastBus > QUIET && qHead === qT.length;
  // Run the drive until its clock reaches T (drive cycles since power-on)
  d.advanceTo = T => {
    for (;;) {
      if (active === fcpu) {
        if (!quiet()) { copy(fcpu, gcpu); active = gcpu; d.fast = false; continue; }
        if (T - d.time < MAXLEN) return;
        const t0 = d.time; fcpu.step(); d.fastCycles += d.time - t0;
        continue;
      }
      if (d.time >= T) return;
      if (!gen) {
        if (quiet()) { copy(gcpu, fcpu); active = fcpu; d.fast = true; continue; }
        gen = gcpu.step();
      }
      if (gen.next().done) gen = null;
    }
  };
  d.resetGen = () => { gen = null; active = gcpu; d.fast = false; d.lastBus = 0; qT.length = qV.length = 0; qHead = 0; c64v = 0; };
  // VIA2 port B: stepper (bits 0-1), motor (2), LED (3), write protect (4, input), density (5-6), SYNC (7, input, low = sync)
  via2.inB = () => 0x10 | (d.sync ? 0 : 0x80);
  via2.inA = () => d.readByte | 0;
  let lastPhase = 0;
  via2.onWriteB = () => {
    const out = (via2.orb & via2.ddrb) | (~via2.ddrb & 0xff);
    const ph = out & 3, step = (ph - lastPhase) & 3;
    if (step === 1 && d.halftrack < 84) d.halftrack++;
    else if (step === 3 && d.halftrack > 2) d.halftrack--;
    if (step === 1 || step === 3) d.byteTimer = 0;
    lastPhase = ph; d.motor = (out & 4) !== 0; d.led = (out & 8) !== 0;
  };
  // VIA1 port B: serial bus. Inputs are inverted (1 = line pulled low); bits 5-6 = device number 8
  via1.inB = () => {
    const o = d.outB(), atn = (c64v & 8) !== 0;
    const clk = (c64v & 0x10) !== 0 || (o & 0x08) !== 0;
    const data = (c64v & 0x20) !== 0 || (o & 0x02) !== 0 || (((o >> 4) & 1) ^ (atn ? 1 : 0)) === 1;
    return (data ? 1 : 0) | (clk ? 4 : 0) | (atn ? 0x80 : 0);
  };
  via1.onWriteB = () => { d.lastBus = d.time; };
  d.outB = () => (via1.orb | ~via1.ddrb) & 0xff;
  d.reset = () => { via1.reset(); via2.reset(); via2.inB = () => 0x10 | (d.sync ? 0 : 0x80); via2.inA = () => d.readByte | 0;
    via2.onWriteB = d._wb; via1.inB = d._ib; via1.onWriteB = d._w1; ram.fill(0); d.resetGen(); gcpu.reset(); copy(gcpu, fcpu); d.motor = false; };
  d._wb = via2.onWriteB; d._ib = via1.inB; d._w1 = via1.onWriteB;
  d.insert = img => { d.img = img; d.tracks = img ? d64ToGcr(img) : null; d.dirty = false; };
  d.exportD64 = () => d.tracks ? gcrToD64(d.tracks, d.img) : null;
  return d;
}

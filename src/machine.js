/*
 * C64-emulator — maskinen: minnekart, VIC-II, IEC-buss, LOAD-felle
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
// ---- The machine (cycle exact bus) ----
const W = 384, H = 272, FIRST = 15, LINES = 312, CPL = 63;
const PAL = [0x000000,0xFFFFFF,0x68372B,0x70A4B2,0x6F3D86,0x588D43,0x352879,0xB8C76F,
             0x6F4F25,0x433900,0x9A6759,0x444444,0x6C6C6C,0x9AD284,0x6C5EB5,0x959595]
  .map(c => 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | (c >> 16));

function makeC64(roms) {
  const ram = new Uint8Array(65536), colorRam = new Uint8Array(1024);
  const { basic, kernal, chargen } = roms;
  const vregs = new Uint8Array(64), sid = new SID(44100);
  const cia1 = new CIA(), cia2 = new CIA();
  const keys = new Uint8Array(8);
  let latch67 = 0xc8, joy1 = 0, joy2 = 0, ssColl = 0, sbColl = 0, badEn = false, disk = null;
  let port = 0x37, ddr = 0x2f, raster = 0, cyc = 0, rcmp = 0, vicIrq = false, nmiPrev = false, frameDone = false, ba = false;
  const frame = new Uint32Array(W * H);
  // ---- 1541 on the IEC bus ----
  let drive = null, dTarget = 0, trapLoad = true;
  const D_RATIO = 1000000 / 985248;
  const DCYC = [7,6,2,8,3,3,5,5,3,2,2,2,4,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7, 6,6,2,8,3,3,5,5,4,2,2,2,4,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
    6,6,2,8,3,3,5,5,3,2,2,2,3,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7, 6,6,2,8,3,3,5,5,4,2,2,2,5,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
    2,6,2,6,3,3,3,3,2,2,2,2,4,4,4,4, 2,6,2,6,4,4,4,4,2,5,2,5,5,5,5,5, 2,6,2,6,3,3,3,3,2,2,2,2,4,4,4,4, 2,5,2,5,4,4,4,4,2,4,2,4,4,4,4,4,
    2,6,2,8,3,3,5,5,2,2,2,2,4,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7, 2,6,2,8,3,3,5,5,2,2,2,2,4,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7];
  const c64PA = () => (cia2.pra | ~cia2.ddra) & 0xff;
  // Bus snapshot: both sides see each other's outputs from the previous cycle
  const snap = { atn: false, clk: false, data: false };
  function busUpdate() {
    const pa = c64PA(), o = drive ? drive.outB() : 0;
    const atn = (pa & 0x08) !== 0;
    snap.clk = (pa & 0x10) !== 0 || (o & 0x08) !== 0;
    snap.data = (pa & 0x20) !== 0 || (o & 0x02) !== 0 || (drive !== null && (((o >> 4) & 1) ^ (atn ? 1 : 0)) === 1);
    snap.atn = atn;
    const v = pa & 0x38;
    if (v !== lastPA) { lastPA = v; if (drive) { drive.c64Bus(v, dNow + 1); drive.advanceTo(dNow); } }
  }
  const bus = { atnLow: () => snap.atn, clkLow: () => snap.clk, dataLow: () => snap.data, changed: () => {} };
  let dAcc = 0, dNow = 0, lastPA = -1;
  // per-line layers (canvas coordinates)
  const gfx = new Uint8Array(W), fgL = new Uint8Array(W), spr = new Uint8Array(W), sprBack = new Uint8Array(W), smask = new Uint8Array(W);
  const sprBA = new Uint8Array(65);
  let vborder = true, lx = 32, rx = 352, rowBase = -1;

  // graphics sequencer (VC/RC model)
  let vcbase = 0, vc = 0, rc = 0, display = false, fetched = false, vbFF = true;
  const mtxC = new Uint8Array(40), mtxCol = new Uint8Array(40);
  const vread = off => { const bankN = 3 - ((cia2.pra | ~cia2.ddra) & 3);
    off &= 0x3fff; return ((bankN & 1) === 0 && (off & 0x3000) === 0x1000) ? chargen[off & 0xfff] : ram[bankN * 0x4000 + off]; };
  cia1.readPA = function () { return ((this.pra | ~this.ddra) & 0xff) & ~joy2; };
  cia1.readPB = function () {
    const sel = (this.pra | ~this.ddra) & 0xff; let rows = 0xff;
    for (let c = 0; c < 8; c++) if (!((sel >> c) & 1)) rows &= ~keys[c];
    return this.pbTimer(rows & ((this.prb | ~this.ddrb) & 0xff) & ~joy1);
  };
  cia2.readPA = function () {
    let v = ((this.pra | ~this.ddra) & 0x3f);
    if (!bus.clkLow()) v |= 0x40;
    if (!bus.dataLow()) v |= 0x80;
    return v;
  };

  const bankBits = () => (port | ~ddr) & 7;
  const updVicIrq = () => { vicIrq = (vregs[0x19] & vregs[0x1a] & 0xf) !== 0; };
  function rasterHit() { vregs[0x19] |= 1; updVicIrq(); }
  function vicRead(r) {
    switch (r) {
      case 0x11: return (vregs[0x11] & 0x7f) | ((raster & 0x100) >> 1);
      case 0x12: return raster & 0xff;
      case 0x16: return vregs[0x16] | 0xc0;
      case 0x18: return vregs[0x18] | 1;
      case 0x19: return vregs[0x19] | 0x70 | (vicIrq ? 0x80 : 0);
      case 0x1a: return vregs[0x1a] | 0xf0;
      case 0x1e: { const v = ssColl; ssColl = 0; return v; }
      case 0x1f: { const v = sbColl; sbColl = 0; return v; }
    }
    if (r >= 0x20 && r <= 0x2e) return vregs[r] | 0xf0;
    return r > 0x2e ? 0xff : vregs[r];
  }
  function vicWrite(r, v) {
    const old = rcmp;
    if (r === 0x11) { vregs[r] = v; rcmp = (rcmp & 0xff) | ((v & 0x80) << 1); if (raster === 0x30 && (v & 0x10)) badEn = true; }
    else if (r === 0x12) rcmp = (rcmp & 0x100) | v;
    else if (r === 0x19) vregs[0x19] &= ~v & 0xf;
    else vregs[r] = v;
    if (rcmp !== old && rcmp === raster) rasterHit();
    updVicIrq();
  }
  function ioRead(a) {
    if (a < 0xd400) return vicRead(a & 0x3f);
    if (a < 0xd800) { const r = a & 0x1f; return r === 0x19 || r === 0x1a ? 0xff : sid.read(r); }
    if (a < 0xdc00) return colorRam[a & 0x3ff] | 0xf0;
    if (a < 0xdd00) return cia1.read(a & 15);
    if (a < 0xde00) return cia2.read(a & 15);
    return 0xff;
  }
  function ioWrite(a, v) {
    if (a < 0xd400) vicWrite(a & 0x3f, v);
    else if (a < 0xd800) sid.write(a & 0x1f, v);
    else if (a < 0xdc00) colorRam[a & 0x3ff] = v & 15;
    else if (a < 0xdd00) cia1.write(a & 15, v);
    else if (a < 0xde00) { cia2.write(a & 15, v); if ((a & 15) === 0 || (a & 15) === 2) bus.changed(); }
  }
  function peek(a) {
    if (a < 0xa000) { if (a > 1) return ram[a]; return a === 0 ? ddr : (((latch67 & 0xc8) | ((~ddr | port) & 0x37)) & ((ddr & 0x20) ? 0xff : 0xdf)); }
    const b = bankBits();
    if (a < 0xc000) return (b & 3) === 3 ? basic[a - 0xa000] : ram[a];
    if (a < 0xd000) return ram[a];
    if (a < 0xe000) { if ((b & 3) === 0) return ram[a]; return (b & 4) ? ioRead(a) : chargen[a - 0xd000]; }
    return (b & 2) ? kernal[a - 0xe000] : ram[a];
  }
  function poke(a, v) {
    if (a < 2) { if (a === 0) ddr = v; else port = v; ram[a] = v; latch67 = ((latch67 & ~ddr) | (port & ddr)) & 0xc8; return; }
    if (a >= 0xd000 && a < 0xe000) { const b = bankBits(); if ((b & 3) !== 0 && (b & 4)) { ioWrite(a, v); return; } }
    ram[a] = v;
  }

  // ---- clocking: VIC before the CPU access, CIA/SID after it ----
  function sprShown(i, line) { const dl = line - vregs[1 + 2 * i] - 1; return dl >= 0 && dl < (21 << ((vregs[0x17] >> i) & 1)); }
  function newLine() {
    sprBA.fill(0);
    const en = vregs[0x15];
    if (en) for (let i = 0; i < 8; i++) {
      if (!((en >> i) & 1)) continue;
      if (i <= 2) { if (sprShown(i, raster + 1)) { const s = 58 + 2 * i; for (let k = s - 3; k <= s + 1; k++) sprBA[k] = 1; } }
      else {
        const s = 2 * i - 5;
        if (sprShown(i, raster)) for (let k = Math.max(1, s - 3); k <= s + 1; k++) sprBA[k] = 1;
        if (sprShown(i, raster + 1) && s - 3 < 1) for (let k = 63 + (s - 3); k <= 63; k++) sprBA[k] = 1;
      }
    }
    prepLine(raster);
  }
  const isBad = () => badEn && raster >= 0x30 && raster <= 0xf7 && (raster & 7) === (vregs[0x11] & 7);
  function borderCheck() {
    const d = vregs[0x11], top = (d & 8) ? 51 : 55, bot = (d & 8) ? 251 : 247;
    if (raster === bot) vbFF = true; else if (raster === top && (d & 0x10)) vbFF = false;
  }
  function vicTick() {
    if (++cyc > CPL) {
      cyc = 1;
      if (++raster >= LINES) { raster = 0; badEn = false; frameDone = true; }
      if (raster === 0) vcbase = 0;
      fetched = false;
      borderCheck();
      newLine();
    }
    if (cyc === (raster === 0 ? 2 : 1) && raster === rcmp) rasterHit();
    if (raster === 0x30 && (vregs[0x11] & 0x10)) badEn = true;
    const bad = isBad();
    if (bad) display = true;
    if (cyc === 14) { vc = vcbase; if (bad) rc = 0; }
    if (bad && !fetched && cyc >= 15 && cyc <= 54) fetchMatrix();
    if (cyc === 16) renderGfx();
    if (cyc === 58) { if (rc === 7) { vcbase = vc; display = false; } if (bad) display = true; if (display) rc = (rc + 1) & 7; }
    if (cyc === 63) borderCheck();
    if (cyc >= 13 && cyc <= 60 && rowBase >= 0) drawChunk((cyc - 13) * 8);
    ba = (bad && cyc >= 12 && cyc <= 54) || sprBA[cyc] === 1;
  }
  function fetchMatrix() {
    const scr = ((vregs[0x18] >> 4) & 15) * 0x400;
    for (let i = 0; i < 40; i++) { const a = (vc + i) & 0x3ff; mtxC[i] = vread(scr + a); mtxCol[i] = colorRam[a] & 15; }
    fetched = true;
  }
  // g-accesses for the whole line (cycles 16-55), driven by VC/RC and display/idle state
  function renderGfx() {
    const R = vregs, d011 = R[0x11], d016 = R[0x16], d018 = R[0x18];
    const ecm = d011 & 0x40, bmm = d011 & 0x20, mcm = d016 & 0x10, xs = d016 & 7, bg0 = 16;
    const chr = ((d018 >> 1) & 7) << 11, bmp = (d018 & 8) << 10;
    const draw = rowBase >= 0;
    const put = (x, k, f) => { if (x < 320) { gfx[32 + x] = k; fgL[32 + x] = f; } };
    if (draw) for (let c = 0; c < 40; c++) {
      let code = 0, col = 0, bits;
      if (display) {
        code = mtxC[c]; col = mtxCol[c];
        let a = bmm ? bmp | (((vc + c) & 0x3ff) << 3) | rc : chr | (code << 3) | rc;
        if (ecm) a &= 0x39ff;
        bits = vread(a);
      } else bits = vread(ecm ? 0x39ff : 0x3fff);
      const x = c * 8 + xs;
      if (bmm) {
        if (ecm) { for (let p = 0; p < 8; p++) put(x + p, 0, (bits >> (7 - p)) & 1); }
        else if (mcm) { for (let p = 0; p < 4; p++) { const v = (bits >> (6 - 2 * p)) & 3;
            const k = v === 0 ? bg0 : v === 1 ? code >> 4 : v === 2 ? code & 15 : col;
            put(x + 2 * p, k, v >> 1); put(x + 2 * p + 1, k, v >> 1); } }
        else { for (let p = 0; p < 8; p++) { const b = (bits >> (7 - p)) & 1; put(x + p, b ? code >> 4 : code & 15, b); } }
      } else if (ecm && mcm) { for (let p = 0; p < 8; p++) put(x + p, 0, (bits >> (7 - p)) & 1); }
      else if (mcm && (col & 8)) {
        for (let p = 0; p < 4; p++) { const v = (bits >> (6 - 2 * p)) & 3;
          const k = v === 0 ? bg0 : v === 1 ? R[0x22] & 15 : v === 2 ? R[0x23] & 15 : col & 7;
          put(x + 2 * p, k, v >> 1); put(x + 2 * p + 1, k, v >> 1); }
      } else {
        const fg = mcm ? col & 7 : col, bg = (ecm && (code >> 6)) ? R[0x21 + (code >> 6)] & 15 : bg0;
        for (let p = 0; p < 8; p++) { const b = (bits >> (7 - p)) & 1; put(x + p, b ? fg : bg, b); }
      }
    }
    if (display) vc = (vc + 40) & 0x3ff;
    // sprite-background collisions need this line's foreground
    let sb = 0;
    if (draw && sprAny) for (let x = 32; x < 352; x++) if (fgL[x] && smask[x]) sb |= smask[x];
    if (sb) { if (!sbColl) vregs[0x19] |= 2; sbColl |= sb; updVicIrq(); }
  }
  function ciaTick() {
    cia1.cycle(); cia2.cycle();
    if (++sid.cyc >= sid.cps) { sid.cyc -= sid.cps; sid.sample(); }
    if (drive) {
      dAcc += D_RATIO;
      while (dAcc >= 1) { dAcc -= 1; dNow++; }
      if (!drive.fast || dNow - drive.time >= 8) drive.advanceTo(dNow);
    }
    busUpdate();
  }
  // The CPU sees the interrupt lines as they were before the CIAs clock in this cycle
  let irqS = false;
  function sampleLines() {
    irqS = vicIrq || cia1.irq;
    const l = cia2.irq; if (l && !nmiPrev) cpu.nmiPending = true; nmiPrev = l;
  }
  function rd(a) { vicTick(); while (ba) { sampleLines(); ciaTick(); vicTick(); } const v = peek(a); sampleLines(); ciaTick(); return v; }
  function wr(a, v) { vicTick(); poke(a, v); sampleLines(); ciaTick(); }
  const cpu = makeCPU(rd, wr);
  cpu.irq = () => irqS;

  // ---- VIC-II: prepare a raster line, then draw it 8 pixels per cycle ----
  let sprAny = false;
  function prepLine(line) {
    const y = line - FIRST; rowBase = (y >= 0 && y < H) ? y * W : -1;
    gfx.fill(16); fgL.fill(0); spr.fill(255); sprAny = false;
    if (rowBase < 0) return;
    const R = vregs, d016 = R[0x16];
    lx = (d016 & 8) ? 32 : 39; rx = (d016 & 8) ? 352 : 343;
    const en = R[0x15]; if (!en) return;
    const scr = ((R[0x18] >> 4) & 15) * 0x400;
    smask.fill(0); let ss = 0;
    for (let i = 7; i >= 0; i--) {
      if (!((en >> i) & 1) || !sprShown(i, line)) continue;
      sprAny = true;
      const yexp = (R[0x17] >> i) & 1, sl = (line - R[1 + 2 * i] - 1) >> yexp;
      const base = vread(scr + 0x3f8 + i) * 64 + sl * 3;
      const bits = (vread(base) << 16) | (vread(base + 1) << 8) | vread(base + 2);
      const cx = (R[2 * i] | (((R[0x10] >> i) & 1) << 8)) + 8;
      const xexp = (R[0x1d] >> i) & 1, mc = (R[0x1c] >> i) & 1, prio = (R[0x1b] >> i) & 1, col = R[0x27 + i] & 15, bit = 1 << i;
      const put = (x, k) => {
        if (x < 0 || x >= W) return;
        const prev = smask[x]; if (prev) ss |= prev | bit; smask[x] = prev | bit;
        spr[x] = k & 15; sprBack[x] = prio;
      };
      if (mc) { const w = 2 << xexp;
        for (let p = 0; p < 12; p++) { const v = (bits >> (22 - 2 * p)) & 3; if (!v) continue;
          const k = v === 1 ? R[0x25] : v === 2 ? col : R[0x26];
          for (let q = 0; q < w; q++) put(cx + p * w + q, k); } }
      else { const w = 1 << xexp;
        for (let p = 0; p < 24; p++) { if (!((bits >> (23 - p)) & 1)) continue;
          for (let q = 0; q < w; q++) put(cx + p * w + q, col); } }
    }
    if (ss) { if (!ssColl) vregs[0x19] |= 4; ssColl |= ss; updVicIrq(); }
  }
  function drawChunk(x0) {
    const R = vregs, border = PAL[R[0x20] & 15], bg0 = R[0x21] & 15;
    for (let x = x0; x < x0 + 8; x++) {
      let col;
      if (vbFF || x < lx || x >= rx) { frame[rowBase + x] = border; continue; }
      const s = spr[x];
      if (s !== 255 && !(sprBack[x] && fgL[x])) col = s;
      else { const g = gfx[x]; col = g === 16 ? bg0 : g; }
      frame[rowBase + x] = PAL[col];
    }
  }

  function runFrame() {
    frameDone = false;
    while (!frameDone) {
      if (cpu.PC === 0xf4a5 && disk && (trapLoad || !drive) && (bankBits() & 2) && kernal[0x14a5] === 0x85 && kernal[0x14a6] === 0x93) loadTrap();
      cpu.step();
    }
  }

  // ---- Virtual 1541: KERNAL LOAD trap on device 8 ----
  function matchName(pat, name) {
    for (let i = 0; i < pat.length; i++) {
      if (pat[i] === 0x2a) return true;
      if (i >= name.length) return false;
      if (pat[i] !== 0x3f && pat[i] !== name[i]) return false;
    }
    return pat.length === name.length;
  }
  function dirListing() {
    const out = [], line = (num, bytes) => { out.push(1, 1, num & 255, num >> 8, ...bytes, 0); };
    const pad = (b, n) => { const r = [...b]; while (r.length < n) r.push(0x20); return r; };
    line(0, [0x12, 0x22, ...pad(disk.name, 16), 0x22, 0x20, ...disk.id]);
    for (const f of disk.files) {
      const sp = f.blocks < 10 ? 3 : f.blocks < 100 ? 2 : 1;
      line(f.blocks, [...Array(sp).fill(0x20), ...pad([0x22, ...f.name, 0x22], 18), ...[...(['DEL','SEQ','PRG','USR','REL'][f.type] || 'PRG')].map(c => c.charCodeAt(0))]);
    }
    line(disk.free, [...'BLOCKS FREE.'].map(c => c.charCodeAt(0)));
    out.push(0, 0);
    return Uint8Array.from([0x01, 0x04, ...out]);
  }
  function loadTrap() {
    if (ram[0xba] !== 8) return;
    const len = ram[0xb7], ptr = ram[0xbb] | (ram[0xbc] << 8);
    let name = []; for (let i = 0; i < len; i++) name.push(peek((ptr + i) & 0xffff));
    const colon = name.indexOf(0x3a); if (colon >= 0) name = name.slice(colon + 1);
    const comma = name.indexOf(0x2c); if (comma >= 0) name = name.slice(0, comma);
    if (api.onLoad) api.onLoad(name);
    let data = null;
    if (name.length === 1 && name[0] === 0x24) data = dirListing();
    else { const pat = name.length ? name : [0x2a]; const f = disk.files.find(f => f.type === 2 && matchName(pat, f.name)); if (f) data = f.data; }
    if (cpu.A !== 0) { cpu.C = 0; ram[0x90] = 0; cpu.rts(); return; }
    if (!data || data.length < 2) { cpu.A = 4; cpu.C = 1; cpu.rts(); return; }
    const addr = ram[0xb9] === 0 ? ram[0xc3] | (ram[0xc4] << 8) : data[0] | (data[1] << 8);
    const body = data.subarray(2), end = Math.min(addr + body.length, 0x10000);
    ram.set(body.subarray(0, end - addr), addr);
    ram[0xae] = end & 255; ram[0xaf] = (end >> 8) & 255; ram[0x90] = 0x40;
    cpu.X = end & 255; cpu.Y = (end >> 8) & 255; cpu.C = 0; cpu.rts();
  }

  function powerOn() {
    ram.fill(0); for (let i = 0; i < 65536; i += 128) ram.fill(0xff, i + 64, i + 128);
    colorRam.fill(0); vregs.fill(0); cia1.reset(); cia2.reset(); sid.reset();
    port = 0x37; ddr = 0x2f; latch67 = 0xc8; rcmp = 0; vicIrq = false; ssColl = 0; sbColl = 0;
    raster = 0; cyc = 0; badEn = false; nmiPrev = false; vcbase = vc = rc = 0; display = false; vbFF = true;
    cpu.reset();
    if (drive) { drive.reset(); drive.time = 0; dAcc = 0; dNow = 0; lastPA = -1; drive.bus = bus; } busUpdate();
  }
  const api = { onLoad: null, ram, frame, keys, cpu, sid, cia1, cia2, attachDisk: d => { disk = d; },
    setDriveRom: rom => { if (rom) { drive = make1541(rom); drive.rom = rom; drive.bus = bus; drive.reset(); dNow = drive.time; dAcc = 0; lastPA = -1; } else drive = null; busUpdate(); },
    insertDisk: img => { if (drive) drive.insert(img); },
    setTrap: on => { trapLoad = on; },
    get drive() { return drive; },
    runFrame, powerOn, setJoy: (v2, v1 = 0) => { joy2 = v2; joy1 = v1; }, restore: () => { cpu.nmiPending = true; } };
  return api;
}

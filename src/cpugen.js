/*
 * C64-emulator — GENERERT fil: 6510 som generator for 1541-stasjonen. Ikke rediger; lages av tools/gen_cpugen.py fra src/cpu.js
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
// ---- MOS 6510, bus-cycle exact: every rd()/wr() call is exactly one clock cycle ----
function makeCPUGen(rd, wr) {
  const IMP=0,ACC=1,IMM=2,ZP=3,ZPX=4,ZPY=5,ABS=6,ABX=7,ABY=8,IND=9,IZX=10,IZY=11,REL=12;
  const OPN = new Array(256).fill(null), OPM = new Uint8Array(256);
  const def = (n, l) => l.forEach(([o, m]) => { OPN[o] = n; OPM[o] = m; });
  const g1 = b => [[b+9,IMM],[b+5,ZP],[b+0x15,ZPX],[b+0xd,ABS],[b+0x1d,ABX],[b+0x19,ABY],[b+1,IZX],[b+0x11,IZY]];
  ['ORA','AND','EOR','ADC','STA','LDA','CMP','SBC'].forEach((n,i)=>def(n, g1(i*0x20).filter(([o])=>o!==0x89)));
  const sh = b => [[b+0xa,ACC],[b+6,ZP],[b+0x16,ZPX],[b+0xe,ABS],[b+0x1e,ABX]];
  def('ASL',sh(0)); def('ROL',sh(0x20)); def('LSR',sh(0x40)); def('ROR',sh(0x60));
  def('INC',[[0xe6,ZP],[0xf6,ZPX],[0xee,ABS],[0xfe,ABX]]);
  def('DEC',[[0xc6,ZP],[0xd6,ZPX],[0xce,ABS],[0xde,ABX]]);
  def('LDX',[[0xa2,IMM],[0xa6,ZP],[0xb6,ZPY],[0xae,ABS],[0xbe,ABY]]);
  def('LDY',[[0xa0,IMM],[0xa4,ZP],[0xb4,ZPX],[0xac,ABS],[0xbc,ABX]]);
  def('STX',[[0x86,ZP],[0x96,ZPY],[0x8e,ABS]]);
  def('STY',[[0x84,ZP],[0x94,ZPX],[0x8c,ABS]]);
  def('CPX',[[0xe0,IMM],[0xe4,ZP],[0xec,ABS]]);
  def('CPY',[[0xc0,IMM],[0xc4,ZP],[0xcc,ABS]]);
  def('BIT',[[0x24,ZP],[0x2c,ABS]]);
  def('JMP',[[0x4c,ABS],[0x6c,IND]]); def('JSR',[[0x20,ABS]]);
  [['BPL',0x10],['BMI',0x30],['BVC',0x50],['BVS',0x70],['BCC',0x90],['BCS',0xb0],['BNE',0xd0],['BEQ',0xf0]].forEach(([n,o])=>def(n,[[o,REL]]));
  [['BRK',0],['PHP',8],['CLC',0x18],['PLP',0x28],['SEC',0x38],['RTI',0x40],['PHA',0x48],['CLI',0x58],['RTS',0x60],
   ['PLA',0x68],['SEI',0x78],['DEY',0x88],['TXA',0x8a],['TYA',0x98],['TXS',0x9a],['TAY',0xa8],['TAX',0xaa],
   ['CLV',0xb8],['TSX',0xba],['INY',0xc8],['DEX',0xca],['CLD',0xd8],['INX',0xe8],['NOP',0xea],['SED',0xf8]]
   .forEach(([n,o])=>def(n,[[o,IMP]]));
  [0x1a,0x3a,0x5a,0x7a,0xda,0xfa].forEach(o=>def('NOP',[[o,IMP]]));
  [0x80,0x82,0x89,0xc2,0xe2].forEach(o=>def('NOP',[[o,IMM]]));
  [0x04,0x44,0x64].forEach(o=>def('NOP',[[o,ZP]]));
  [0x14,0x34,0x54,0x74,0xd4,0xf4].forEach(o=>def('NOP',[[o,ZPX]]));
  def('NOP',[[0x0c,ABS]]); [0x1c,0x3c,0x5c,0x7c,0xdc,0xfc].forEach(o=>def('NOP',[[o,ABX]]));
  const rmw = b => [[b+3,IZX],[b+7,ZP],[b+0xf,ABS],[b+0x13,IZY],[b+0x17,ZPX],[b+0x1b,ABY],[b+0x1f,ABX]];
  def('SLO',rmw(0)); def('RLA',rmw(0x20)); def('SRE',rmw(0x40)); def('RRA',rmw(0x60)); def('DCP',rmw(0xc0)); def('ISC',rmw(0xe0));
  def('SAX',[[0x83,IZX],[0x87,ZP],[0x8f,ABS],[0x97,ZPY]]);
  def('LAX',[[0xa3,IZX],[0xa7,ZP],[0xaf,ABS],[0xb3,IZY],[0xb7,ZPY],[0xbf,ABY]]);
  def('LXA',[[0xab,IMM]]); def('XAA',[[0x8b,IMM]]); def('ANC',[[0x0b,IMM],[0x2b,IMM]]);
  def('ALR',[[0x4b,IMM]]); def('ARR',[[0x6b,IMM]]); def('SBX',[[0xcb,IMM]]); def('SBC',[[0xeb,IMM]]);
  def('LAS',[[0xbb,ABY]]); def('SHA',[[0x93,IZY],[0x9f,ABY]]); def('SHX',[[0x9e,ABY]]); def('SHY',[[0x9c,ABX]]); def('TAS',[[0x9b,ABY]]);
  [0x02,0x12,0x22,0x32,0x42,0x52,0x62,0x72,0x92,0xb2,0xd2,0xf2].forEach(o=>def('JAM',[[o,IMP]]));

  // access kind per mnemonic: r = read, w = write, m = read-modify-write, x = special
  const KIND = {};
  'LDA LDX LDY ADC SBC AND ORA EOR CMP CPX CPY BIT LAX LXA XAA ANC ALR ARR SBX LAS NOP'.split(' ').forEach(n=>KIND[n]='r');
  'STA STX STY SAX SHA SHX SHY TAS'.split(' ').forEach(n=>KIND[n]='w');
  'ASL LSR ROL ROR INC DEC SLO RLA SRE RRA DCP ISC'.split(' ').forEach(n=>KIND[n]='m');

  const c = { A:0, X:0, Y:0, S:0xfd, PC:0, C:0, Z:0, I:1, D:0, V:0, N:0,
    irq:()=>false, nmiPending:false, ip1:false, ip2:false, np1:false, np2:false, jammed:false };
  let noPoll = false, hiBase = 0, crossed = false;
  const poll = () => {
    if (noPoll) return;
    c.ip2 = c.ip1; c.ip1 = !c.I && c.irq();
    c.np2 = c.np1; c.np1 = c.nmiPending;
  };
  function* R(a) { const v = rd(a); poll(); yield; return v; }
  function* W(a, v) { wr(a, v); poll(); yield; }
  function* fetch() { const v = (yield* R(c.PC)); c.PC = (c.PC + 1) & 0xffff; return v; }
  function* push(v) { (yield* W(0x100 | c.S, v)); c.S = (c.S - 1) & 255; }
  function* pop() { c.S = (c.S + 1) & 255; return (yield* R(0x100 | c.S)); }
  const getP = b => (c.N?0x80:0)|(c.V?0x40:0)|0x20|(b?0x10:0)|(c.D?8:0)|(c.I?4:0)|(c.Z?2:0)|(c.C?1:0);
  const setP = v => { c.N=v&0x80?1:0; c.V=v&0x40?1:0; c.D=v&8?1:0; c.I=v&4?1:0; c.Z=v&2?1:0; c.C=v&1; };
  const nz = v => { c.Z = v===0?1:0; c.N = v&0x80?1:0; return v; };
  function adc(m) {
    if (c.D) {
      let lo=(c.A&0xf)+(m&0xf)+c.C, hi=(c.A&0xf0)+(m&0xf0);
      c.Z = ((c.A+m+c.C)&255)===0?1:0;
      if (lo>9) lo+=6; if (lo>0xf) hi+=0x10;
      c.N = hi&0x80?1:0; c.V = (~(c.A^m)&(c.A^hi)&0x80)?1:0;
      if (hi>0x90) hi+=0x60;
      c.C = hi>0xff?1:0; c.A = ((lo&0xf)|(hi&0xf0))&255;
    } else { const t = c.A+m+c.C; c.V = (~(c.A^m)&(c.A^t)&0x80)?1:0; c.C = t>0xff?1:0; c.A = nz(t&255); }
  }
  function sbc(m) {
    if (c.D) {
      const b = 1-c.C, t = c.A-m-b;
      let lo=(c.A&0xf)-(m&0xf)-b, hi=(c.A>>4)-(m>>4);
      if (lo<0) { lo-=6; hi--; } if (hi<0) hi-=6;
      c.V = ((c.A^m)&(c.A^t)&0x80)?1:0; c.C = t>=0?1:0; nz(t&255);
      c.A = ((hi<<4)|(lo&0xf))&255;
    } else adc(m^0xff);
  }
  const cmp = (r, m) => { const t=r-m; c.C = t>=0?1:0; nz(t&255); };
  // indexed absolute: dummy read of the un-fixed address when the page is crossed (reads) or always (writes/RMW)
  function* absIdx(idx, always) {
    const lo = (yield* fetch()), hi = (yield* fetch()), l2 = lo + idx;
    hiBase = hi; crossed = l2 > 255;
    if (crossed || always) (yield* R((hi << 8) | (l2 & 255)));
    return ((hi << 8) + l2) & 0xffff;
  }
  function* izy(always) {
    const z = (yield* fetch()), lo = (yield* R(z)), hi = (yield* R((z + 1) & 255)), l2 = lo + c.Y;
    hiBase = hi; crossed = l2 > 255;
    if (crossed || always) (yield* R((hi << 8) | (l2 & 255)));
    return ((hi << 8) + l2) & 0xffff;
  }
  function* interrupt(nmi) {
    (yield* R(c.PC)); (yield* R(c.PC));
    (yield* push(c.PC >> 8)); (yield* push(c.PC & 255));
    // a pending NMI can hijack an IRQ sequence up to the vector fetch
    if (!nmi && c.nmiPending && c.np1) nmi = true;
    if (nmi) c.nmiPending = false;
    (yield* push(getP(0))); c.I = 1;
    const v = nmi ? 0xfffa : 0xfffe;
    const lo = (yield* R(v)); c.PC = lo | ((yield* R(v + 1)) << 8);
    c.ip1 = c.ip2 = false; c.np1 = c.np2 = false;
  }
  c.reset = () => { c.S=0xfd; c.I=1; c.D=0; c.PC=rd(0xfffc)|(rd(0xfffd)<<8); c.nmiPending=false; c.ip1=c.ip2=c.np1=c.np2=false; c.jammed=false; };
  c.rts = () => { c.S=(c.S+1)&255; const lo=rd(0x100|c.S); c.S=(c.S+1)&255; c.PC=((lo|(rd(0x100|c.S)<<8))+1)&0xffff; };

  c.step = function* () {
    if (c.np2 && c.nmiPending) { (yield* interrupt(true)); return; }
    if (c.ip2) { (yield* interrupt(false)); return; }
    if (c.jammed) { (yield* R(0xffff)); return; }
    const op = (yield* fetch()), n = OPN[op], mode = OPM[op];
    if (n === null) { (yield* R(c.PC)); return; }
    const kind = KIND[n];
    let ad = 0, m;
    switch (mode) {
      case IMP: case ACC: (yield* R(c.PC)); break;
      case IMM: ad = c.PC; c.PC = (c.PC + 1) & 0xffff; break;
      case ZP: ad = (yield* fetch()); break;
      case ZPX: { const z = (yield* fetch()); (yield* R(z)); ad = (z + c.X) & 255; break; }
      case ZPY: { const z = (yield* fetch()); (yield* R(z)); ad = (z + c.Y) & 255; break; }
      case ABS: if (n === 'JMP' || n === 'JSR') break; ad = (yield* fetch()); ad |= (yield* fetch()) << 8; break;
      case ABX: ad = (yield* absIdx(c.X, kind !== 'r')); break;
      case ABY: ad = (yield* absIdx(c.Y, kind !== 'r')); break;
      case IZX: { const z = (yield* fetch()); (yield* R(z)); const p = (z + c.X) & 255; const lo = (yield* R(p)); ad = lo | ((yield* R((p + 1) & 255)) << 8); break; }
      case IZY: ad = (yield* izy(kind !== 'r')); break;
    }
    if (kind === 'm') {
      if (mode === ACC) m = c.A; else { m = (yield* R(ad)); (yield* W(ad, m)); }
      let r;
      switch (n) {
        case 'ASL': case 'SLO': c.C = m >> 7; r = (m << 1) & 255; break;
        case 'LSR': case 'SRE': c.C = m & 1; r = m >> 1; break;
        case 'ROL': case 'RLA': r = ((m << 1) | c.C) & 255; c.C = m >> 7; break;
        case 'ROR': case 'RRA': r = (m >> 1) | (c.C << 7); c.C = m & 1; break;
        case 'INC': case 'ISC': r = (m + 1) & 255; break;
        case 'DEC': case 'DCP': r = (m - 1) & 255; break;
      }
      if (mode === ACC) c.A = nz(r); else (yield* W(ad, r));
      switch (n) {
        case 'ASL': case 'LSR': case 'ROL': case 'ROR': case 'INC': case 'DEC': if (mode !== ACC) nz(r); break;
        case 'SLO': c.A = nz(c.A | r); break; case 'RLA': c.A = nz(c.A & r); break;
        case 'SRE': c.A = nz(c.A ^ r); break; case 'RRA': adc(r); break;
        case 'DCP': cmp(c.A, r); break; case 'ISC': sbc(r); break;
      }
      return;
    }
    if (kind === 'r') {
      if (mode === IMP) return;
      m = (yield* R(ad));
      switch (n) {
        case 'LDA': c.A = nz(m); break; case 'LDX': c.X = nz(m); break; case 'LDY': c.Y = nz(m); break;
        case 'ADC': adc(m); break; case 'SBC': sbc(m); break;
        case 'AND': c.A = nz(c.A & m); break; case 'ORA': c.A = nz(c.A | m); break; case 'EOR': c.A = nz(c.A ^ m); break;
        case 'CMP': cmp(c.A, m); break; case 'CPX': cmp(c.X, m); break; case 'CPY': cmp(c.Y, m); break;
        case 'BIT': c.Z = (c.A & m) ? 0 : 1; c.N = m & 0x80 ? 1 : 0; c.V = m & 0x40 ? 1 : 0; break;
        case 'LAX': c.A = c.X = nz(m); break;
        case 'LXA': c.A = c.X = nz((c.A | 0xee) & m); break;
        case 'XAA': c.A = nz((c.A | 0xee) & c.X & m); break;
        case 'ANC': c.A = nz(c.A & m); c.C = c.N; break;
        case 'ALR': { const t = c.A & m; c.C = t & 1; c.A = nz(t >> 1); break; }
        case 'ARR': {
          const t = c.A & m, r = (t >> 1) | (c.C << 7);
          if (c.D) {
            c.N = c.C; c.Z = r === 0 ? 1 : 0; c.V = ((t ^ r) & 0x40) ? 1 : 0; let a = r;
            if ((t & 15) + (t & 1) > 5) a = (a & 0xf0) | ((a + 6) & 0xf);
            if ((t >> 4) + ((t >> 4) & 1) > 5) { c.C = 1; a = (a + 0x60) & 255; } else c.C = 0;
            c.A = a;
          } else { c.A = nz(r); c.C = (r >> 6) & 1; c.V = ((r >> 6) ^ (r >> 5)) & 1; }
          break; }
        case 'SBX': { const t = (c.A & c.X) - m; c.C = t >= 0 ? 1 : 0; c.X = nz(t & 255); break; }
        case 'LAS': { const t = m & c.S; c.A = c.X = c.S = nz(t); break; }
      }
      return;
    }
    if (kind === 'w') {
      let v;
      switch (n) {
        case 'STA': v = c.A; break; case 'STX': v = c.X; break; case 'STY': v = c.Y; break;
        case 'SAX': v = c.A & c.X; break;
        default: {
          if (n === 'TAS') c.S = c.A & c.X;
          const src = n === 'SHA' ? c.A & c.X : n === 'SHX' ? c.X : n === 'SHY' ? c.Y : c.S;
          v = src & ((hiBase + 1) & 255);
          if (crossed) ad = (v << 8) | (ad & 255);
        }
      }
      (yield* W(ad, v));
      return;
    }
    // specials
    switch (n) {
      case 'JMP':
        if (mode === ABS) { const lo = (yield* fetch()); c.PC = lo | ((yield* fetch()) << 8); }
        else { const pl = (yield* fetch()), ph = (yield* fetch()), p = (ph << 8) | pl;
          const lo = (yield* R(p)); c.PC = lo | ((yield* R((p & 0xff00) | ((p + 1) & 0xff))) << 8); }
        break;
      case 'JSR': { const lo = (yield* fetch()); (yield* R(0x100 | c.S)); (yield* push(c.PC >> 8)); (yield* push(c.PC & 255)); c.PC = lo | ((yield* fetch()) << 8); break; }
      case 'RTS': { (yield* R(0x100 | c.S)); const lo = (yield* pop()); const hi = (yield* pop()); c.PC = (lo | (hi << 8)); (yield* R(c.PC)); c.PC = (c.PC + 1) & 0xffff; break; }
      case 'RTI': { (yield* R(0x100 | c.S)); setP((yield* pop())); const lo = (yield* pop()); c.PC = lo | ((yield* pop()) << 8); break; }
      case 'BRK': {
        c.PC = (c.PC + 1) & 0xffff;
        (yield* push(c.PC >> 8)); (yield* push(c.PC & 255));
        const nmi = c.nmiPending && c.np1; if (nmi) c.nmiPending = false;
        (yield* push(getP(1))); c.I = 1;
        const v = nmi ? 0xfffa : 0xfffe; const lo = (yield* R(v)); c.PC = lo | ((yield* R(v + 1)) << 8);
        c.ip1 = c.ip2 = false; c.np1 = c.np2 = false; break; }
      case 'PHA': (yield* push(c.A)); break;
      case 'PHP': (yield* push(getP(1))); break;
      case 'PLA': (yield* R(0x100 | c.S)); c.A = nz((yield* pop())); break;
      case 'PLP': (yield* R(0x100 | c.S)); setP((yield* pop())); break;
      case 'BPL': case 'BMI': case 'BVC': case 'BVS': case 'BCC': case 'BCS': case 'BNE': case 'BEQ': {
        const off = (yield* fetch());
        const cond = n === 'BPL' ? !c.N : n === 'BMI' ? c.N : n === 'BVC' ? !c.V : n === 'BVS' ? c.V :
                     n === 'BCC' ? !c.C : n === 'BCS' ? c.C : n === 'BNE' ? !c.Z : c.Z;
        if (cond) {
          const t = (c.PC + (off < 128 ? off : off - 256)) & 0xffff;
          // a taken branch without page crossing does not poll interrupts in its last cycle
          if ((t ^ c.PC) & 0xff00) { (yield* R(c.PC)); (yield* R((c.PC & 0xff00) | (t & 0xff))); }
          else { noPoll = true; (yield* R(c.PC)); noPoll = false; }
          c.PC = t;
        }
        break; }
      case 'CLC': c.C = 0; break; case 'SEC': c.C = 1; break;
      case 'CLI': c.I = 0; break; case 'SEI': c.I = 1; break;
      case 'CLD': c.D = 0; break; case 'SED': c.D = 1; break;
      case 'CLV': c.V = 0; break;
      case 'INX': c.X = nz((c.X + 1) & 255); break; case 'INY': c.Y = nz((c.Y + 1) & 255); break;
      case 'DEX': c.X = nz((c.X - 1) & 255); break; case 'DEY': c.Y = nz((c.Y - 1) & 255); break;
      case 'TAX': c.X = nz(c.A); break; case 'TAY': c.Y = nz(c.A); break;
      case 'TXA': c.A = nz(c.X); break; case 'TYA': c.A = nz(c.Y); break;
      case 'TSX': c.X = nz(c.S); break; case 'TXS': c.S = c.X; break;
      case 'JAM': c.jammed = true; break;
    }
  };
  return c;
}

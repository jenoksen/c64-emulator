/*
 * C64-emulator — MOS 6526 CIA (timere, interrupter, porter)
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
// ---- CIA 6526, cycle exact ----
//
// The timer state machine below (class CIATimer: constants, setCR, clock, latchLo,
// latchHi, pb) is a JavaScript port of src/c64/CIA/timer.cpp and timer.h from
// libsidplayfp (https://github.com/libsidplayfp/libsidplayfp), which carries:
//
//   Copyright 2011-2013 Leandro Nini <drfiemost@users.sourceforge.net>
//   Copyright 2007-2010 Antti Lankila
//   Copyright 2000 Simon White
//   Licensed under the GNU General Public License, version 2 or (at your option) any later version.
//
// Changes made in this port (2026): translated from C++ to JavaScript, event scheduling replaced by
// a per-cycle clock() call, state bit values renumbered to fit 32-bit integers, interrupt handling
// left to the CIA class below (which is original code in this project).
const T_START=0x01, T_STEP=0x04, T_OSCR=0x08, T_FLOAD=0x10, T_PHI2=0x20, T_CNT2=0x100, T_CNT3=0x200,
      T_OS0=0x800, T_LOAD1=0x1000, T_OS=0x80000, T_LOAD=0x100000, T_OUT=0x40000000;
class CIATimer {
  constructor() { this.reset(); }
  reset() { this.timer = 0xffff; this.latch = 0xffff; this.state = 0; this.last = 0; this.pbToggle = false; }
  setCR(cr) { this.state = (this.state & ~0x39) | ((cr & 0x39) ^ T_PHI2); this.last = cr; }
  clock() {
    let s = this.state;
    if (s & T_CNT3) this.timer = (this.timer - 1) & 0xffff;
    let adj = s & (T_START | T_OSCR | T_PHI2);
    if ((s & (T_START | T_PHI2)) === (T_START | T_PHI2)) adj |= T_CNT2;
    if ((s & T_CNT2) || (s & (T_STEP | T_START)) === (T_STEP | T_START)) adj |= T_CNT3;
    adj |= (s & (T_FLOAD | T_OSCR | T_LOAD1 | T_OS0)) << 8;
    s = adj; let uf = false;
    if (this.timer === 0 && (s & T_CNT3)) {
      s |= T_LOAD | T_OUT;
      if (s & (T_OS | T_OS0)) s &= ~(T_START | T_CNT2);
      this.pbToggle = (this.last & 6) === 6 && !this.pbToggle;
      uf = true;
    }
    if (s & T_LOAD) { this.timer = this.latch; s &= ~T_CNT3; }
    this.state = s;
    return uf;
  }
  latchLo(v) { this.latch = (this.latch & 0xff00) | v; if (this.state & T_LOAD) this.timer = this.latch; }
  latchHi(v) { this.latch = (this.latch & 0xff) | (v << 8);
    if (this.state & T_LOAD) this.timer = this.latch; else if (!(this.state & T_START)) this.state |= T_LOAD1; }
  pb(cr) { return (cr & 4) ? this.pbToggle : (this.state & T_OUT) !== 0; }
}
// interrupt pipeline bits
const SI0=1<<0, SI1=1<<1, SR0=1<<2, SR1=1<<3, CL0=1<<4, CL1=1<<5, AK0=1<<6, AK1=1<<7;
const CIA_MASK = ~(SI0|SR0|CL0|AK0);
class CIA {
  constructor() { this.A = new CIATimer(); this.B = new CIATimer(); this.reset(); }
  reset() {
    this.pra=0; this.prb=0; this.ddra=0; this.ddrb=0; this.cra=0; this.crb=0;
    this.imr=0; this.icr=0; this.icrAck=0; this.delay=0; this.irq=false;
    this.A.reset(); this.B.reset();
  }
  get ta() { return this.A.timer; }
  cycle() {
    const ua = this.A.clock(), ub = this.B.clock();
    if (ua && (this.crb & 0x41) === 0x41 && (this.B.state & T_START)) this.B.state |= T_STEP;
    let d = this.delay;
    if (ua) this.icrAck &= ~1;
    if (ub) this.icrAck &= ~2;
    if (d & AK1) this.icr &= ~this.icrAck;
    if (d & CL1) { this.icr &= 0x7f; this.irq = false; }
    if (ua) this.icr |= 1;
    if (ub) this.icr |= 2;
    if ((ua && (this.imr & 1)) || (ub && (this.imr & 2))) d |= SI0 | SR0;
    if (d & SR1) this.icr |= 0x80;
    if (d & SI1) this.irq = true;
    this.delay = (d << 1) & CIA_MASK;
  }
  read(r) {
    switch (r) {
      case 0: return this.readPA(); case 1: return this.readPB();
      case 2: return this.ddra; case 3: return this.ddrb;
      case 4: return this.A.timer & 255; case 5: return this.A.timer >> 8;
      case 6: return this.B.timer & 255; case 7: return this.B.timer >> 8;
      case 0xb: return 1;
      case 0xd: {
        const v = this.icr & 0x9f;
        this.delay &= ~(SI0 | SI1 | SR0 | SR1);
        this.delay |= CL0 | AK0; this.icrAck = 0xff;
        return v; }
      case 0xe: return (this.cra & 0xee) | (this.A.state & 1);
      case 0xf: return (this.crb & 0xee) | (this.B.state & 1);
    }
    return 0;
  }
  write(r, v) {
    switch (r) {
      case 0: this.pra = v; break; case 1: this.prb = v; break;
      case 2: this.ddra = v; break; case 3: this.ddrb = v; break;
      case 4: this.A.latchLo(v); break; case 5: this.A.latchHi(v); break;
      case 6: this.B.latchLo(v); break; case 7: this.B.latchHi(v); break;
      case 0xd:
        if (v & 0x80) this.imr |= v & 0x1f; else this.imr &= ~v & 0x1f;
        if ((this.imr & this.icr & 0x1f) && !this.irq) this.delay |= SI0 | SR0;
        break;
      case 0xe: if ((v & 1) && !(this.cra & 1)) this.A.pbToggle = true; this.A.setCR(v); this.cra = v; break;
      case 0xf: if ((v & 1) && !(this.crb & 1)) this.B.pbToggle = true; this.B.setCR(v | ((v & 0x40) >> 1)); this.crb = v; break;
    }
  }
  pbTimer(v) {
    if (this.cra & 2) v = (v & 0xbf) | (this.A.pb(this.cra) ? 0x40 : 0);
    if (this.crb & 2) v = (v & 0x7f) | (this.B.pb(this.crb) ? 0x80 : 0);
    return v;
  }
  readPA() { return (this.pra | ~this.ddra) & 0xff; }
  readPB() { return this.pbTimer((this.prb | ~this.ddrb) & 0xff); }
}

#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
# Lager src/cpugen.js fra src/cpu.js: samme 6510-kjerne, men som generator der hver busstilgang
# er et yield-punkt, slik at 1541-stasjonen kan kjøres syklus for syklus flettet inn i C64-en.
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'src' / 'cpu.js').read_text(encoding='utf-8')
head_end = src.index('*/') + 2
s = src[head_end:].split("if (typeof module !== 'undefined')")[0]
s = s.replace("function makeCPU(rd, wr) {", "function makeCPUGen(rd, wr) {")
defs = {
 "const R = a => { const v = rd(a); poll(); return v; };": "function* R(a) { const v = rd(a); poll(); yield; return v; }",
 "const W = (a, v) => { wr(a, v); poll(); };": "function* W(a, v) { wr(a, v); poll(); yield; }",
 "const fetch = () => { const v = R(c.PC); c.PC = (c.PC + 1) & 0xffff; return v; };": "function* fetch() { const v = R(c.PC); c.PC = (c.PC + 1) & 0xffff; return v; }",
 "const push = v => { W(0x100 | c.S, v); c.S = (c.S - 1) & 255; };": "function* push(v) { W(0x100 | c.S, v); c.S = (c.S - 1) & 255; }",
 "const pop = () => { c.S = (c.S + 1) & 255; return R(0x100 | c.S); };": "function* pop() { c.S = (c.S + 1) & 255; return R(0x100 | c.S); }",
 "function absIdx(": "function* absIdx(", "function izy(": "function* izy(", "function interrupt(": "function* interrupt(",
 "c.step = function () {": "c.step = function* () {",
}
for a, b in defs.items():
    assert a in s, a
    s = s.replace(a, b)
pat = re.compile(r'(?<![\w.*])(R|W|fetch|push|pop|absIdx|izy|interrupt)\(')
i = 0
while True:
    m = pat.search(s, i)
    if not m: break
    if s[max(0, m.start() - 10):m.start()].endswith('function* '):
        i = m.end(); continue
    k = m.end(); depth = 1
    while depth:
        depth += {'(': 1, ')': -1}.get(s[k], 0); k += 1
    s = s[:m.start()] + '(yield* ' + s[m.start():k] + ')' + s[k:]
    i = m.start() + 8 + (m.end() - m.start())
header = src[:head_end].replace('MOS 6510-prosessor, syklusnøyaktig på bussnivå',
  'GENERERT fil: 6510 som generator for 1541-stasjonen. Ikke rediger; lages av tools/gen_cpugen.py fra src/cpu.js')
(root / 'src' / 'cpugen.js').write_text(header + s, encoding='utf-8')
print('Skrev src/cpugen.js')

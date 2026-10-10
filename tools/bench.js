// SPDX-License-Identifier: GPL-2.0-or-later
// Ytelsestest. Legg basic.bin, kernal.bin, chargen.bin, dos1541.bin og example.d64 (fra cadaver/c64gameframework) i data/.
// Bruk: node tools/bench.js [sekunder per scenario]
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src'), DATA = path.join(__dirname, '..', 'data');
const strip = s => s.split("if (typeof module !== 'undefined')")[0];
const code = ['cpu.js', 'cpugen.js', 'sid.js', 'cia.js', 'drive1541.js', 'machine.js', 'd64.js']
  .map(f => strip(fs.readFileSync(path.join(SRC, f), 'utf8'))).join('\n');
const { makeC64, parseD64 } = new Function(code + '; return { makeC64, parseD64 };')();
const rom = n => new Uint8Array(fs.readFileSync(path.join(DATA, n)));
const ROMS = { basic: rom('basic.bin'), kernal: rom('kernal.bin'), chargen: rom('chargen.bin') };
const SECS = +process.argv[2] || 10, FRAMES = SECS * 50;

function machine({ drive = false, trap = true, disk = null } = {}) {
  const m = makeC64(ROMS);
  if (disk) { const img = rom(disk); m.attachDisk(parseD64(img)); if (drive) { m.setDriveRom(rom('dos1541.bin')); m.insertDisk(img); } }
  else if (drive) m.setDriveRom(rom('dos1541.bin'));
  m.setTrap(trap); m.powerOn();
  return m;
}
function type(m, s, frames = 0) {
  const q = [...s].map(c => c.charCodeAt(0));
  for (let f = 0; f < frames || q.length; f++) {
    if (q.length && m.ram[0xc6] === 0) { let n = 0; while (n < 10 && q.length) m.ram[0x277 + n++] = q.shift(); m.ram[0xc6] = n; }
    m.runFrame(); m.sid.n = 0;
  }
}
function measure(m, frames, perFrame) {
  const t = new Float64Array(frames);
  for (let i = 0; i < frames; i++) { const a = process.hrtime.bigint(); if (perFrame) perFrame(m, i); m.runFrame(); m.sid.n = 0; t[i] = Number(process.hrtime.bigint() - a) / 1e6; }
  const s = [...t].sort((a, b) => a - b), sum = t.reduce((a, b) => a + b, 0);
  return { avg: sum / frames, p50: s[frames >> 1], p95: s[Math.floor(frames * 0.95)], p99: s[Math.floor(frames * 0.99)], max: s[frames - 1], speed: (frames * 20) / sum };
}
const scenarios = [
  ['BASIC i ro (READY.)', () => { const m = machine(); type(m, '', 150); return m; }],
  ['BASIC-løkke + SID 3 stemmer m/filter', () => {
    const m = machine(); type(m, '', 150);
    type(m, 'S=54272:POKES+24,31:POKES+23,247:POKES+22,80\r', 30);
    type(m, 'FORV=0TO2:POKES+V*7+5,9:POKES+V*7+6,240:POKES+V*7+1,20+V*9:POKES+V*7+4,65:NEXT\r', 60);
    type(m, '10 FORI=1TO100:A=SIN(I)*I:NEXT:POKE53280,I:GOTO10\rRUN\r', 30); return m; }],
  ['Rasterbars (tett VIC-løkke, maskinkode)', () => {
    const m = machine(); type(m, '', 150);
    [0x78,0xAE,0x12,0xD0,0x8E,0x20,0xD0,0x8E,0x21,0xD0,0x4C,0x01,0xC0].forEach((b, i) => m.ram[0xc000 + i] = b);
    type(m, 'SYS49152\r', 20); return m; }],
  ['Ekte 1541: hurtiglaster laster spill', () => {
    const m = machine({ drive: true, trap: true, disk: 'example.d64' });
    type(m, 'LOAD"*",8,1\rRUN\r', 300); return m; }],
  ['Spill kjører (1541 tilkoblet, i ro)', () => {
    const m = machine({ drive: true, trap: true, disk: 'example.d64' });
    type(m, 'LOAD"*",8,1\rRUN\r', 50 * 40); return m; }],
];
console.log(`Node ${process.version}, ${require('os').cpus()[0].model}, ${SECS} s emulert tid per scenario\n`);
console.log('Scenario'.padEnd(40) + 'Fart'.padStart(7) + 'Snitt'.padStart(9) + 'p95'.padStart(8) + 'p99'.padStart(8) + 'Maks'.padStart(8) + '  Motor');
const results = [];
for (const [name, setup] of scenarios) {
  const m = setup();
  measure(m, 50, null); // JIT warm-up
  const r = measure(m, FRAMES, null); const motor = m.drive ? (m.drive.motor ? 'går' : 'står') : '-';
  results.push({ name, ...r, motor });
  console.log(name.padEnd(40) + (r.speed.toFixed(1) + 'x').padStart(7) + (r.avg.toFixed(2) + 'ms').padStart(9) + r.p95.toFixed(2).padStart(8) + r.p99.toFixed(2).padStart(8) + r.max.toFixed(2).padStart(8) + '  ' + motor);
}

console.log('\nBudsjett: 20 ms per bilde (50 Hz PAL). Fart = emulert tid / reell tid.');

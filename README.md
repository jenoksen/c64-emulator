# C64 Emulator

A Commodore 64 emulator for the browser, written from scratch in plain JavaScript with no external libraries. The whole emulator ships as a single HTML file.

The user interface is in English, with Norwegian available from the language button.

**Try it in your browser:** <https://jenoksen.github.io/c64-emulator/>

## What is emulated

- **MOS 6510**: cycle-exact at bus level, with all documented and undocumented instructions.
- **VIC-II**: text and bitmap modes, sprites with collisions, raster IRQ, bad lines, VC/RC sequencing and the vertical border.
- **SID 6581**: three voices, ADSR, ring modulation, sync and a multimode filter.
- **CIA 6526**: cycle-exact timers, interrupts, keyboard and joystick.
- **Commodore 1541**: its own 6502 running Commodore DOS, two VIA 6522s, a GCR-encoded disk and the IEC bus, cycle by cycle. Fast loaders work.
- **Interface**: loads D64, PRG and ZIP files. Has touch controls with a virtual joystick for mobile, and can save modified disks.

Verified against Wolfgang Lorenz' test suite (all four disks) and Klaus Dormann's 6502 functional test.

## Usage

Open <https://jenoksen.github.io/c64-emulator/>, or open `dist/c64-emulator.html` locally in a browser. The first time, you need to add the contents of three ROM chips from a C64. The ROM files are copyrighted works of Commodore and are not included in this project. Use files you have the right to use, for example read out from your own machine. They are stored only in your browser.

| ROM | Size | Commodore part number |
|---|---|---|
| BASIC | 8 kB | 901226-01 |
| KERNAL | 8 kB | 901227-03, or a national variant |
| Character generator | 4 kB | 901225-01 |
| 1541 DOS (optional, for the real disk drive and fast loaders) | 16 kB | 1541-II 251968-03, or the two halves 325302-01 and 901229-05 |

The emulator recognises the files by size and content, so the file names do not matter.

## Building

```
python3 tools/gen_cpugen.py   # only needed after changes to src/cpu.js
python3 tools/build.py        # creates dist/c64-emulator.html
```

| File | Contents |
|---|---|
| `src/cpu.js` | The 6510 CPU |
| `src/cpugen.js` | Generated from `cpu.js`, do not edit |
| `src/sid.js` | The sound chip |
| `src/cia.js` | The CIAs. The timer is ported from libsidplayfp. |
| `src/drive1541.js` | The disk drive |
| `src/machine.js` | Memory map, VIC-II, bus and wiring |
| `src/d64.js` | D64 directory parser |
| `src/ui.html` | User interface and template for the built file |

## Benchmark

```
node tools/bench.js 10
```

The benchmark measures five scenarios:
- idle BASIC
- SID-heavy BASIC
- raster bars
- a fast loader loading a game
- a game running with the 1541 attached

For each, it reports the average, p95, p99 and maximum time per frame. The budget is 20 ms per frame. It needs the ROM files and `example.d64` in `data/`; see the top of the script.

## License

Copyright © 2026 John Werner Enoksen <john@enoksen.no>. Developed with the help of Claude (Anthropic).

Free software under the **GNU General Public License version 2 or (at your option) any later version** (GPL-2.0-or-later). See `LICENSE`.

The project contains code ported from libsidplayfp, which uses the same license. The original copyright notice is kept in `src/cia.js`. See `CREDITS.md` for full credits.

The ROM files are copyrighted works of Commodore and are not part of this project or its license. "Commodore" and "Commodore 64" are trademarks of their respective owners. This project is not affiliated with them.

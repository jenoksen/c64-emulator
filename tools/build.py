#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
# Bygger dist/c64-emulator.html: én selvstendig HTML-fil av kildefilene i src/.
import html, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'src'
order = ['cpu.js', 'cpugen.js', 'sid.js', 'cia.js', 'drive1541.js', 'machine.js', 'd64.js']
strip = lambda s: s.split("if (typeof module !== 'undefined')")[0]
core = '\n'.join(strip((src / f).read_text(encoding='utf-8')) for f in order)
page = (src / 'ui.html').read_text(encoding='utf-8')
page = page.replace('/*CORE*/', core).replace('<!--LICENSE_TEXT-->', html.escape((root / 'LICENSE').read_text(encoding='utf-8')))
out = root / 'dist' / 'c64-emulator.html'
out.parent.mkdir(exist_ok=True)
out.write_text(page, encoding='utf-8')
print(f'Skrev {out} ({out.stat().st_size} byte)')

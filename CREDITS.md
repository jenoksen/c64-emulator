# Credits

## Code ported into the project

**libsidplayfp**: <https://github.com/libsidplayfp/libsidplayfp>
Copyright 2011-2013 Leandro Nini, 2007-2010 Antti Lankila, 2000 Simon White. GPL-2.0-or-later.

The CIA timer state machine (`CIATimer` in `src/cia.js`) is ported from `src/c64/CIA/timer.cpp` and `timer.h`. Changes made in the port:

- translated from C++ to JavaScript
- event scheduling replaced by one call per cycle
- state bits renumbered
- interrupt logic moved to the project's own code

## Documentation and data the project builds on

- **Christian Bauer**: "The MOS 6567/6569 video controller (VIC-II) and its application in the Commodore 64". The VIC-II model is based on it.
- **Philip "Pepto" Timmermann**: the colour palette, from his measurements of the VIC-II.
- **"No More Secrets"** (groepaz et al.): reference for the undocumented 6510 instructions.
- **Commodore**: technical data for the 6510, VIC-II, SID, CIA, VIA and 1541.

## Used for testing, not included

- **Wolfgang Lorenz**: test suite for C64 emulators (public domain), via VICE-testprogs: <https://github.com/libsidplayfp/VICE-testprogs>
- **Klaus Dormann**: 6502 functional test: <https://github.com/Klaus2m5/6502_65C02_functional_tests>
- **Lasse Öörni (Cadaver)**: c64gameframework, whose example game tests the 1541 and its fast loader: <https://github.com/cadaver/c64gameframework>

## Other

- **Chivo**: typeface by Omnibus-Type, SIL Open Font License 1.1, loaded from Google Fonts.

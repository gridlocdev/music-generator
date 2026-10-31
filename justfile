port := "8000"

# list recipes
default:
    @just --list

# install the pinned engine into node_modules
install:
    npm install

# serve the game on localhost; ES modules don't load from file://
serve: _deps
    python3 -m http.server {{port}}

# serve the game and open it in the default browser
play: _deps
    #!/usr/bin/env bash
    set -euo pipefail
    python3 -m http.server {{port}} & server=$!
    trap 'kill $server' EXIT INT TERM
    until curl -sf -o /dev/null http://localhost:{{port}}/; do sleep 0.1; done
    python3 -m webbrowser http://localhost:{{port}}/
    wait $server

# syntax-check every module and check the layer rules
check:
    @for f in $(find src -name '*.js'); do node --check "$f" || exit 1; done
    node tools/coupling-report.mjs --strict

# run the unit tests for lib/ and *-data.js files
test:
    node --test

_deps:
    @[ -d node_modules/littlejsengine ] || npm install

# rebuild src/audio/soundfont-catalog-data.js after adding or replacing .sf2 files (libraries: src/audio/soundfont-libraries-data.js)
catalog:
    node tools/sf2-catalog.mjs

# download the openly licensed SoundFont libraries into soundfonts/
soundfonts:
    #!/usr/bin/env bash
    set -euo pipefail
    gu=https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main
    ms=https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General
    mkdir -p soundfonts/GeneralUser-GS soundfonts/FluidR3_GM soundfonts/MuseScore_General
    (cd soundfonts/GeneralUser-GS && curl -fSLO $gu/GeneralUser-GS.sf2 && curl -fSLO $gu/documentation/LICENSE.txt)
    (cd soundfonts/MuseScore_General && for f in MuseScore_General.sf2 MuseScore_General_License.md VERSION; do curl -fSLO $ms/$f; done)
    # the original MIT FluidR3_GM, as Debian packages it
    tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
    curl -fSL -o "$tmp/fluid.deb" https://deb.debian.org/debian/pool/main/f/fluid-soundfont/fluid-soundfont-gm_3.1-6_all.deb
    (cd "$tmp" && ar x fluid.deb && tar xf data.tar.xz)
    cp "$tmp/usr/share/sounds/sf2/FluidR3_GM.sf2" soundfonts/FluidR3_GM/
    cp "$tmp/usr/share/doc/fluid-soundfont-gm/copyright" soundfonts/FluidR3_GM/COPYING

# compose a song without the browser: print its plan, optionally its melody and a .mid file
# e.g. just compose first-light --melody --midi first-light.mid   ·   just compose feel:tender
compose *args:
    node tools/compose.mjs {{args}}

# A/B listening: render each song with an older commit and with this checkout, side by side
# e.g. just ab   ·   just ab a913205   (then open the URL it prints; port 8010 or the next free one)
ab rev="main": _deps
    node tools/ab-server.mjs {{rev}}

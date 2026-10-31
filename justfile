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

# download the openly licensed SoundFont libraries into soundfonts/; ones already there are skipped
soundfonts:
    bash tools/fetch-soundfonts.sh

# compose a song without the browser: print its plan, optionally its melody and a .mid file
# e.g. just compose first-light --melody --midi first-light.mid   ·   just compose feel:tender
compose *args:
    node tools/compose.mjs {{args}}

# A/B listening: render each song with an older commit and with this checkout, side by side
# e.g. just ab   ·   just ab a913205   (then open the URL it prints; port 8010 or the next free one)
ab rev="main": _deps
    node tools/ab-server.mjs {{rev}}

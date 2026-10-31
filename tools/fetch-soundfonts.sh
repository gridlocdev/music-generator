#!/usr/bin/env bash
# Downloads the openly licensed SoundFont libraries into soundfonts/, each with its license file.
# A library already on disk is skipped. Run by `just soundfonts`, and by the deploy before staging.
set -euo pipefail
cd "$(dirname "$0")/.."

gu=https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main
ms=https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General

if [ ! -f soundfonts/GeneralUser-GS/GeneralUser-GS.sf2 ]; then
    mkdir -p soundfonts/GeneralUser-GS
    (cd soundfonts/GeneralUser-GS && curl -fsSLO $gu/GeneralUser-GS.sf2 && curl -fsSLO $gu/documentation/LICENSE.txt)
fi

if [ ! -f soundfonts/MuseScore_General/MuseScore_General.sf2 ]; then
    mkdir -p soundfonts/MuseScore_General
    (cd soundfonts/MuseScore_General && for f in MuseScore_General.sf2 MuseScore_General_License.md VERSION; do curl -fsSLO $ms/$f; done)
fi

# the original MIT FluidR3_GM, as Debian packages it
if [ ! -f soundfonts/FluidR3_GM/FluidR3_GM.sf2 ]; then
    mkdir -p soundfonts/FluidR3_GM
    tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
    curl -fsSL -o "$tmp/fluid.deb" https://deb.debian.org/debian/pool/main/f/fluid-soundfont/fluid-soundfont-gm_3.1-6_all.deb
    (cd "$tmp" && ar x fluid.deb && tar xf data.tar.xz)
    cp "$tmp/usr/share/sounds/sf2/FluidR3_GM.sf2" soundfonts/FluidR3_GM/
    cp "$tmp/usr/share/doc/fluid-soundfont-gm/copyright" soundfonts/FluidR3_GM/COPYING
fi

#!/usr/bin/env bash
# Installs Music Generator as a desktop app that runs this checkout (its code, soundfonts/ and scratch/), so
# changes here show up the next time it opens. On macOS: ~/Applications/Music Generator.app, a renamed copy of
# the Electron in node_modules with its own name and bundle id, so macOS asks for the microphone for it.
# On Linux: a launcher in ~/.local/share/applications. Run it again after moving the checkout or updating Electron.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
name='Music Generator'

case "$(uname)" in
Darwin)
    dest="$HOME/Applications/$name.app"
    mkdir -p "$HOME/Applications"
    rm -rf "$dest"
    cp -R "$root/node_modules/electron/dist/Electron.app" "$dest"
    plist="$dest/Contents/Info.plist"
    /usr/libexec/PlistBuddy \
        -c "Set :CFBundleName $name" \
        -c "Set :CFBundleDisplayName $name" \
        -c "Set :CFBundleIdentifier dev.gridloc.music-generator" \
        -c "Set :CFBundleIconFile icon.icns" \
        -c "Set :NSMicrophoneUsageDescription $name listens to your whistling to write it out as notes." \
        "$plist"
    # Electron runs Resources/app when it's there: a stub that loads electron/main.js from the checkout
    res="$dest/Contents/Resources"
    rm -f "$res/default_app.asar" "$res/electron.icns"
    cp "$root/assets/icon/icon.icns" "$res/icon.icns"
    mkdir -p "$res/app"
    printf '{ "name": "music-generator", "productName": "%s", "main": "main.mjs" }\n' "$name" > "$res/app/package.json"
    printf "import '%s';\n" "$root/electron/main.js" > "$res/app/main.mjs"
    codesign --force --deep --sign - "$dest" 2>/dev/null
    echo "installed $dest"
    ;;
Linux)
    dest="$HOME/.local/share/applications/music-generator.desktop"
    mkdir -p "$(dirname "$dest")"
    cat > "$dest" <<EOF
[Desktop Entry]
Type=Application
Name=$name
Exec="$root/node_modules/electron/dist/electron" "$root"
Path=$root
Icon=$root/assets/icon/icon.png
Categories=AudioVideo;Audio;
EOF
    echo "installed $dest"
    ;;
*)
    echo "install the app with: npx electron ." >&2
    exit 1
    ;;
esac

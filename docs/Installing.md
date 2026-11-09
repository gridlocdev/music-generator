# Installing

Music Generator comes as a ready-to-run download for each platform. Every download includes
everything it needs, including the GeneralUser GS sound library, so you don't have to install
Node.js or anything else first.

Downloads are on the project's GitHub [Releases](https://github.com/gridlocdev/music-generator/releases)
page. Pick the file for your system:

| System | File | How to start it |
|---|---|---|
| macOS, Apple silicon | `Music Generator-<version>-mac-arm64.dmg` | Open it and drag **Music Generator** into **Applications** |
| macOS, Intel | `Music Generator-<version>-mac-x64.dmg` | Open it and drag **Music Generator** into **Applications** |
| Windows 10/11 (x64) | `Music Generator-<version>-win-x64.exe` | Run the installer, then open Music Generator from the Start menu |
| Linux (x64), any distribution | `Music Generator-<version>-linux-x86_64.AppImage` | `chmod +x` it, then run it |
| Ubuntu, Debian, Mint and others | `Music Generator-<version>-linux-amd64.deb` | `sudo apt install ./Music*.deb`, then open it from your apps menu |
| Linux, as a Flatpak | `Music Generator-<version>-linux-x86_64.flatpak` | `flatpak install --user Music*.flatpak`, then open it from your apps menu |

A `.zip` of each Mac app is there too, for when you'd rather not use the disk image.

The Flatpak isn't on Flathub, so it doesn't update itself: download a newer one and install it the
same way. It can use your microphone, the network and your Documents folder, and nothing else in
your home folder.

## First launch warnings

The builds aren't signed with a paid developer certificate yet, so your system may warn you the
first time:

- **macOS** won't open the app the first time and says Apple can't check it for malicious
  software. You only need to get past this once:
  - **macOS 15 (Sequoia) or later:** after the warning, open **System Settings → Privacy &
    Security**, scroll down to the message about Music Generator, click **Open Anyway** and
    confirm with your password or Touch ID.
  - **macOS 12 to 14:** right-click (or Control-click) the app, choose **Open**, then **Open**
    again.
  - **Any version**, in Terminal:
    `xattr -dr com.apple.quarantine "/Applications/Music Generator.app"`, then open the app
    normally. This also fixes a message saying the app is damaged.
- **Windows** SmartScreen may say "Windows protected your PC". Choose **More info**, then
  **Run anyway**.

## The microphone

The first time you record, macOS asks whether Music Generator may use the microphone. If you said
no, turn it on under **System Settings → Privacy & Security → Microphone**. On Windows, check
**Settings → Privacy & security → Microphone**, and in the Flatpak, check its permissions in
Flatseal.

## Where your files go

- **Projects** are in `Documents/Music Generator/projects`, one folder each. The 38 songs it comes
  with are put there the first time it opens, so you can open, change and save them.
- **Sound libraries:** GeneralUser GS comes with the app. FluidR3_GM (148 MB) and
  MuseScore_General (216 MB) download when you press **Download** in the **Instruments** tab.

## Building it yourself

If you'd rather build from source, you need Node.js and [just](https://github.com/casey/just).
From the project folder:

```bash
just soundfonts  # download the three libraries, about 400 MB
just install     # install it as an app: ~/Applications/Music Generator.app on macOS
just app         # or just open it in its own window, without installing
just package     # make the downloads above for this system, in release/
```

The app made by `just install` runs the project folder itself, so it uses its sound libraries and
its `projects/` folder, and picks up your changes the next time it opens (run `just build`
first). More detail is in the [developer guide](Developer-Guide.md).

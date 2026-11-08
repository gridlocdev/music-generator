## Architecture

This app follows the layered layout in `docs/ARCHITECTURE.md`. Read it before adding or moving code. In short:

- `lib → platform → audio → (composer, sketch) → app`; imports only point down that chain.
- `composer/` and `sketch/` hold the music logic and know nothing of the UI. `app/` is the Preact UI: signals in `app/store.js`, actions in `app/*.js`, views in `app/components/`.
- `composer/` and `sketch/` don't import each other; `app/` joins them.
- Content (songs, tables, tuning) goes in `*-data.js` files.
- `lib/` and `*-data.js` files import no DOM code and have tests in `test/`.
- The UI is bundled by esbuild into `dist/` (`just build`); everything else in `src/` also runs as-is in Node for the tools and tests.
- After changes run `just check` (syntax, the bundle and the layer rules via `tools/coupling-report.mjs`) and `just test`.

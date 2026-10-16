## Architecture

This game follows the layered, feature-folder layout in `docs/ARCHITECTURE.md`. Read it before adding or moving code. In short:

- `lib → platform → game → (world, player, render, ui, audio) → features → main.js`; imports only point down that chain.
- A new feature goes in `src/features/<name>/` and is registered in `src/features/index.js`. Don't add top-level `src/*.js` files, and don't edit `main.js` for features.
- Features don't import each other; use `game/events.js` or a registry.
- Each feature owns its save slice and its `*-data.js` content.
- The engine is imported only in `src/platform/engine.js`; other files import from there.
- `lib/` and `*-data.js` files import no engine or DOM code and have tests in `test/`.
- After changes run `just check` (syntax and layer rules via `tools/coupling-report.mjs`) and `just test`.

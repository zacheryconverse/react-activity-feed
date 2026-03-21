# AGENTS.md

## Cursor Cloud specific instructions

This is a React component library (`react-activity-feed`) by GetStream for building activity/notification feeds on top of the Stream Activity Feeds API.

### Runtime

- **Node 16** is required (matches CI default). Use `nvm use 16` if not already active.
- **Yarn v1** is the package manager (`yarn.lock` is committed).
- Install dependencies: `yarn install --frozen-lockfile --ignore-engines`

### Key commands

| Task | Command |
|---|---|
| Lint | `yarn lint` (runs prettier + eslint + stylelint) |
| Unit tests | `yarn test` |
| Build (types + rollup) | `yarn build` |
| Translation validation | `yarn validate-translations` |
| Docs dev server | `yarn docs` |

### Known pre-existing test failures

- 7 of 39 test suites fail on `main` due to axios v1.x shipping ESM that Jest 26 cannot parse (`SyntaxError: Cannot use import statement outside a module`), plus stale snapshots. These are **not** regressions; they exist in the upstream repo.

### Example app

- Located in `example/`. Install with `cd example && yarn install --ignore-engines`.
- On Node 16, do **not** use `yarn start` (it sets `--openssl-legacy-provider` which is invalid on Node 16). Instead run: `BROWSER=none SKIP_PREFLIGHT_CHECK=true npx react-scripts start` from the `example/` directory.
- The example app has hardcoded Stream API credentials in `example/src/App.tsx` — no secrets are needed to run it.

### Pre-commit hook

- Husky runs `yarn lint` on pre-commit. Ensure lint passes before committing.

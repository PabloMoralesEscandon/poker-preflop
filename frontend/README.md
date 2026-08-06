# Frontend

React 18 + TypeScript + Vite + Tailwind. See `../docs/ARCHITECTURE.md` §2–§4 for
the stack and the modularity contract, and `../docs/API-CONTRACT.md` for the
server contract this app codes against.

## Requirements

Node 20.19+ or 22.12+.

## Install

```bash
cd frontend
npm install
```

## Run

The app is designed to be fully usable with the backend switched off. Mock mode
is the default, so this is all you need to see it working:

```bash
npm run dev            # http://localhost:5173, mock mode
```

To run against a real server:

```bash
VITE_API_MODE=live VITE_API_BASE_URL=http://localhost:8000/api/v1 npm run dev
```

Or copy `.env.example` to `.env.local` and edit it.

| Variable            | Default                        | Meaning                                                                            |
| ------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| `VITE_API_MODE`     | `mock`                         | `mock` serves `../docs/examples/` fixtures in-process; `live` talks to the server. |
| `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` | Only used when `VITE_API_MODE=live`.                                               |

## Checks

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # vitest run
npm run build          # tsc --noEmit && vite build
```

`npm run format` rewrites files with Prettier.

## Layout

```text
src/
  api/          # types, ApiClient interface, live + mock implementations
  drills/       # registry.ts maps prompt.kind -> component; one dir per drill
  components/   # drill-agnostic UI (HandGrid, AppShell, ...)
  pages/        # routed screens
  lib/          # small helpers
tests/          # vitest + React Testing Library
```

Two rules keep this modular, and both are enforced by `tests/api/boundary.test.ts`:

- **Nothing outside `src/api/` knows whether the mock or the live client is in
  use.** No component, page, or hook may import from `../docs/examples/`.
- **Shared components never know which drill they serve.** `HandGrid` renders a
  hand → frequency map; it has no idea what RFI is.

## Routes

| Route             | Screen                                       |
| ----------------- | -------------------------------------------- |
| `/`               | drill picker                                 |
| `/drill/:drillId` | session runner for one drill                 |
| `/dev/grid`       | development preview of the 13×13 range chart |

## Seeing the hand grid

```bash
cd frontend && npm run dev
# then open http://localhost:5173/dev/grid
```

Mock mode is the default, so the chart loads `rfi_6max_CO` through the api
client with no backend running. Pick a range and a highlighted hand from the two
selects; clicking a cell highlights it.

The chart encodes three states, never by colour alone:

| State     | Encoding                                           |
| --------- | -------------------------------------------------- |
| pure play | full-height fill in the action's colour            |
| mixed     | partial fill, height = frequency, with a 45° hatch |
| pure fold | empty cell                                         |

Colour identifies _which_ action, drawn from fixed categorical slots
(`--viz-series-1…4` in `src/index.css`) that are validated for both light and
dark surfaces. Action ids are opaque strings — the same component will render
`{"call": 0.6, "raise": 0.4}` unchanged.

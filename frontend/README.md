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

Two rules keep this modular, and both are enforced by review:

- **Nothing outside `src/api/` knows whether the mock or the live client is in
  use.** No component, page, or hook may import from `../docs/examples/`.
- **Shared components never know which drill they serve.** `HandGrid` renders a
  hand → frequency map; it has no idea what RFI is.

## Routes

| Route             | Screen                       |
| ----------------- | ---------------------------- |
| `/`               | drill picker                 |
| `/drill/:drillId` | session runner for one drill |

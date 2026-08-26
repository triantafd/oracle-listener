# TODO — oracle-listener v1

## Setup
- [x] Create project structure
- [x] Configure package.json, tsconfig.json, tsup
- [x] Write CLAUDE.md
- [x] Run `npm install`

## Core implementation
- [x] `src/types.ts` — shared TypeScript types
- [x] `src/store/interface.ts` — BlockStore interface
- [x] `src/store/memory.ts` — InMemoryStore (default)
- [x] `src/store/file.ts` — FileStore (JSON file persistence)
- [x] `src/dedup.ts` — DedupTracker
- [x] `src/poller.ts` — block polling loop
- [x] `src/listener.ts` — OracleListener class
- [x] `src/index.ts` — public exports

## Build & validate
- [x] Run `npm run build` — verify no TypeScript errors
- [x] Verify dist/ has both ESM (.mjs) and CJS (.js) outputs
- [x] Verify .d.ts types are generated

## Test
- [x] Create a minimal test node server (`test-server/`) that:
  - Deploys a simple contract that emits an event
  - Instantiates OracleListener and logs received events
- [x] Test FileStore persistence: stop server, emit event, restart, verify catch-up

## Before publishing to npm
- [ ] Write README.md
- [ ] Add .gitignore
- [ ] `git init` and make first commit

## v2 ideas (after v1 is solid)
- [ ] Auto-reconnect with exponential backoff on RPC failure
- [ ] MongoDB store adapter
- [ ] Redis store adapter
- [ ] HTTP status server (`GET /stats`)
- [ ] Multi-event support (listen to multiple events on one contract)
- [ ] Write-back signer helper

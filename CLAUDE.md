# oracle-listener

Standalone npm library that generalizes the EVM oracle event-listening pattern.
Extracted from `privateer-server/packages/secure-oracle-event-listener`.

## What this library owns
- Polling an EVM chain for smart contract events (via viem `getLogs`)
- Catching up on missed events after restart (persists `lastProcessedBlock` to a store)
- Deduplicating events by `txHash + logIndex`
- Waiting N confirmation blocks before processing (reorg protection)

## What the consumer owns
- `onEvent` callback — all project-specific logic
- Contract ABIs, signing logic, DB schemas, attestation verification, etc.

## Commands

```bash
npm install         # install deps
npm run build       # compile to dist/ (ESM + CJS)
npm run dev         # watch mode
npm run typecheck   # type-check without emitting
```

## Key files

| File | Purpose |
|---|---|
| `src/listener.ts` | `OracleListener` class — main entry point for consumers |
| `src/poller.ts` | Block polling loop, catch-up logic, batch fetching |
| `src/dedup.ts` | `DedupTracker` — prevents double-processing via txHash+logIndex |
| `src/store/interface.ts` | `BlockStore` interface (plug in your own) |
| `src/store/memory.ts` | `InMemoryStore` — default, no persistence |
| `src/store/file.ts` | `FileStore` — persists to a JSON file, no extra deps |
| `src/types.ts` | All exported TypeScript types |
| `src/index.ts` | Public API surface |

## Consumer example

```typescript
import { OracleListener, FileStore } from 'oracle-listener';

const listener = new OracleListener({
  rpcUrl: 'http://localhost:8545',
  contractAddress: '0xABC...',
  abi: MyContractABI,
  eventName: 'OracleRequested',
  pollInterval: 5000,
  confirmationBlocks: 2,
  store: new FileStore('./state/last-block.json'),
  onEvent: async (event) => {
    // your project logic here
    await fulfillOracleJob(event.args);
  },
});

await listener.start();
```

## Out of scope for v1
- MongoDB / Redis store adapters (implement `BlockStore` interface yourself)
- HTTP status server (add to your app)
- Multi-contract listening (instantiate one `OracleListener` per contract)
- Writing results back on-chain (do it inside `onEvent`)

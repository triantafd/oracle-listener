# oracle-listener

A lightweight, config-driven library for listening to EVM smart contract events from a Node.js server.

You provide the contract address, ABI, event name, and a handler function. The library handles all the plumbing: block polling, catch-up on restart, deduplication, and reorg protection.

## Install

```bash
npm install oracle-listener
```

## Quick start

```typescript
import { OracleListener } from 'oracle-listener';

const listener = new OracleListener({
  rpcUrl: 'http://localhost:8545',
  contractAddress: '0xYourContractAddress',
  abi: YourContractABI,
  eventName: 'YourEventName',
  onEvent: async (event) => {
    console.log(event.args);
    // your logic here
  },
});

await listener.start();
```

## Persist state across restarts

By default the library uses an in-memory store, which means it starts from the latest block on every restart. Use `FileStore` to resume from where it left off:

```typescript
import { OracleListener, FileStore } from 'oracle-listener';

const listener = new OracleListener({
  rpcUrl: 'http://localhost:8545',
  contractAddress: '0xYourContractAddress',
  abi: YourContractABI,
  eventName: 'YourEventName',
  store: new FileStore('./last-block.json'),
  onEvent: async (event) => {
    // any events missed while your server was down are replayed here first
    await handleEvent(event.args);
  },
});

await listener.start();
```

## Full config reference

```typescript
const listener = new OracleListener({
  // required
  rpcUrl: 'http://localhost:8545',       // RPC endpoint (HTTP or WS)
  contractAddress: '0xABC...',           // contract to watch
  abi: [...],                            // full contract ABI
  eventName: 'OracleRequested',         // event name to filter
  onEvent: async (event) => { ... },    // called for every new event

  // optional
  pollInterval: 5000,        // how often to poll, in ms (default: 5000)
  confirmationBlocks: 2,     // blocks to wait before processing (default: 2)
  startBlock: 1000000n,      // start block if no saved state (default: 'latest')
  batchSize: 1000,           // max blocks to fetch per poll (default: 1000)
  store: new FileStore(...), // where to save progress (default: InMemoryStore)
  onError: (err) => { ... }, // called on RPC errors (default: console.error)

  // reconnect (all optional)
  reconnect: true,                // auto-reconnect on RPC failure (default: true)
  reconnectInitialDelay: 1000,    // first retry delay in ms (default: 1000)
  reconnectMaxDelay: 60000,       // max retry delay in ms (default: 60000)
  reconnectMaxAttempts: 0,        // max attempts, 0 = unlimited (default: 0)
  onReconnect: () => { ... },     // called when RPC connection is restored
});
```

## The `onEvent` callback

The event object is a [viem Log](https://viem.sh/docs/actions/public/getLogs) with decoded `args`:

```typescript
onEvent: async (event) => {
  event.args          // decoded event arguments (cast to your expected shape)
  event.blockNumber   // bigint
  event.transactionHash
  event.logIndex
  event.address       // contract address
}
```

## Stores

The library uses a `BlockStore` to persist the last processed block. Two built-in options:

| Store | Import | Persistence | Use when |
|---|---|---|---|
| `InMemoryStore` | default | None — resets on restart | Dev/testing |
| `FileStore` | `oracle-listener` | JSON file on disk | Production, no external deps |

### Bring your own store

Implement the `BlockStore` interface to plug in MongoDB, Redis, or anything else:

```typescript
import type { BlockStore } from 'oracle-listener';

class MongoStore implements BlockStore {
  async getLastBlock(): Promise<bigint | null> {
    const doc = await db.collection('state').findOne({ _id: 'lastBlock' });
    return doc ? BigInt(doc.value) : null;
  }

  async setLastBlock(block: bigint): Promise<void> {
    await db.collection('state').updateOne(
      { _id: 'lastBlock' },
      { $set: { value: block.toString() } },
      { upsert: true },
    );
  }
}

const listener = new OracleListener({
  // ...
  store: new MongoStore(),
});
```

## Stop the listener

```typescript
await listener.start();

// later, e.g. on SIGTERM
listener.stop();
```

## Stats

Call `listener.getStats()` at any time to get the current state. Plug it into your existing server's health/status route:

```typescript
// Express example
app.get('/oracle/stats', (req, res) => {
  const stats = listener.getStats();
  res.json({
    ...stats,
    lastProcessedBlock: stats.lastProcessedBlock?.toString(), // bigint → string
  });
});
```

Response shape:

```json
{
  "status": "running",
  "lastProcessedBlock": "31242",
  "failureCount": 0,
  "rpcUrl": "http://localhost:8545",
  "contractAddress": "0xABC...",
  "eventName": "OracleRequested",
  "uptime": 42
}
```

`status` is one of `"running"`, `"reconnecting"` (RPC is down, backoff active), or `"stopped"`.

## Handling RPC failures

By default the library reconnects automatically when the RPC goes down. On each failure it calls `onError`, then waits before retrying with exponential backoff:

```
failure 1 → retry in  1s
failure 2 → retry in  2s
failure 3 → retry in  4s
failure 4 → retry in  8s
failure 5 → retry in 16s
failure 6 → retry in 32s
failure 7+ → retry in 60s  (capped at reconnectMaxDelay)
```

When the RPC comes back, the library resumes from `lastProcessedBlock` — no events are missed.

```typescript
const listener = new OracleListener({
  // ...
  onError: (err) => {
    console.error('RPC error:', err.message);
  },
  onReconnect: () => {
    console.log('RPC restored, resuming...');
  },
});
```

To disable auto-reconnect and handle retries yourself, set `reconnect: false`.

## Requirements

- Node.js >= 18
- An EVM-compatible RPC endpoint (Ethereum, Besu, Anvil, Hardhat, etc.)

## How it works

On every poll interval:
1. Fetches the current block number
2. Subtracts `confirmationBlocks` to get a "safe" block (reorg protection)
3. Fetches all matching event logs from `lastProcessedBlock + 1` to the safe block, in batches
4. For each log: checks deduplication, calls `onEvent`, moves on
5. Saves the safe block to the store

On startup, it loads the last saved block from the store and replays any events it missed while it was down.

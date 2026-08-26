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

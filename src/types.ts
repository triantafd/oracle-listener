import type { Abi, Address, Log } from 'viem';
import type { BlockStore } from './store/interface.js';

/** A decoded event log — viem's Log extended with the parsed args record. */
export type OracleLog = Log & { args: Record<string, unknown> };

export interface OracleListenerConfig {
  /** HTTP or WebSocket RPC endpoint */
  rpcUrl: string;
  /** Address of the contract to watch */
  contractAddress: Address;
  /** Full ABI of the contract (only the event entry is used) */
  abi: Abi;
  /** Name of the event to listen for */
  eventName: string;
  /** How often to poll for new blocks, in ms. Default: 5000 */
  pollInterval?: number;
  /** Number of blocks to wait before processing (reorg protection). Default: 2 */
  confirmationBlocks?: number;
  /** Block to start from if no persisted state exists. Default: 'latest' */
  startBlock?: bigint | 'latest';
  /** Max number of blocks to fetch per poll. Default: 1000 */
  batchSize?: number;
  /** Persistent store for lastProcessedBlock. Default: InMemoryStore */
  store?: BlockStore;
  /** Called for every confirmed, deduplicated event */
  onEvent: (event: OracleLog) => Promise<void>;
  /** Called on polling errors. Default: console.error */
  onError?: (err: unknown) => void;
  /** Enable auto-reconnect with exponential backoff on RPC failure. Default: true */
  reconnect?: boolean;
  /** Initial delay before first reconnect attempt, in ms. Default: 1000 */
  reconnectInitialDelay?: number;
  /** Maximum delay between reconnect attempts, in ms. Default: 60000 */
  reconnectMaxDelay?: number;
  /** Maximum reconnect attempts before giving up (0 = unlimited). Default: 0 */
  reconnectMaxAttempts?: number;
  /** Called when RPC connection is restored after one or more failures */
  onReconnect?: () => void;
}

export type { BlockStore, Log };

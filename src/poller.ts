import { createPublicClient, http } from 'viem';
import type { Abi, AbiEvent } from 'viem';
import type { BlockStore } from './store/interface.js';
import type { OracleLog } from './types.js';
import { DedupTracker } from './dedup.js';

interface PollerOptions {
  rpcUrl: string;
  contractAddress: `0x${string}`;
  abi: Abi;
  eventName: string;
  pollInterval: number;
  confirmationBlocks: number;
  startBlock: bigint | 'latest';
  batchSize: number;
  store: BlockStore;
  onEvent: (event: OracleLog) => Promise<void>;
  onError: (err: unknown) => void;
  reconnect: boolean;
  reconnectInitialDelay: number;
  reconnectMaxDelay: number;
  reconnectMaxAttempts: number;
  onReconnect?: () => void;
}

export class Poller {
  private readonly client;
  private readonly dedup = new DedupTracker();
  private readonly abiEvent: AbiEvent;
  private lastProcessedBlock: bigint | null = null;
  private isProcessing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private failureCount = 0;

  constructor(private readonly opts: PollerOptions) {
    this.client = createPublicClient({ transport: http(opts.rpcUrl) });
    this.abiEvent = this.findAbiEvent();
  }

  async start(): Promise<void> {
    const stored = await this.opts.store.getLastBlock();
    if (stored !== null) {
      this.lastProcessedBlock = stored;
    } else if (this.opts.startBlock !== 'latest') {
      this.lastProcessedBlock = this.opts.startBlock - 1n;
    }
    await this.poll();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedulePoll(delay: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.poll().catch(this.opts.onError);
    }, delay);
  }

  private async poll(): Promise<void> {
    if (this.isProcessing || this.stopped) return;
    this.isProcessing = true;

    try {
      const currentBlock = await this.client.getBlockNumber();
      const safeBlock = currentBlock - BigInt(this.opts.confirmationBlocks);

      if (safeBlock < 0n) {
        this.schedulePoll(this.opts.pollInterval);
        return;
      }

      const fromBlock = this.lastProcessedBlock !== null
        ? this.lastProcessedBlock + 1n
        : safeBlock;

      if (fromBlock <= safeBlock) {
        let batchFrom = fromBlock;
        while (batchFrom <= safeBlock) {
          const batchTo = batchFrom + BigInt(this.opts.batchSize) - 1n;
          const toBlock = batchTo > safeBlock ? safeBlock : batchTo;

          const logs = await this.client.getLogs({
            address: this.opts.contractAddress,
            event: this.abiEvent,
            fromBlock: batchFrom,
            toBlock,
          });

          for (const log of logs) {
            if (log.transactionHash === null || log.logIndex === null) continue;
            if (this.dedup.has(log.transactionHash, log.logIndex)) continue;
            this.dedup.add(log.transactionHash, log.logIndex);
            await this.opts.onEvent(log as OracleLog);
          }

          batchFrom = toBlock + 1n;
        }
      }

      this.lastProcessedBlock = safeBlock;
      await this.opts.store.setLastBlock(safeBlock);

      if (this.failureCount > 0) {
        this.failureCount = 0;
        this.opts.onReconnect?.();
      }

      this.schedulePoll(this.opts.pollInterval);
    } catch (err) {
      this.opts.onError(err);

      if (this.opts.reconnect) {
        this.failureCount++;

        if (this.opts.reconnectMaxAttempts > 0 && this.failureCount > this.opts.reconnectMaxAttempts) {
          this.opts.onError(new Error('[oracle-listener] Max reconnect attempts exceeded, giving up'));
          this.stop();
          return;
        }

        const delay = Math.min(
          this.opts.reconnectInitialDelay * Math.pow(2, this.failureCount - 1),
          this.opts.reconnectMaxDelay,
        );
        this.schedulePoll(delay);
      } else {
        this.schedulePoll(this.opts.pollInterval);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  getStats() {
    return {
      lastProcessedBlock: this.lastProcessedBlock,
      failureCount: this.failureCount,
      stopped: this.stopped,
    };
  }

  private findAbiEvent(): AbiEvent {
    const found = this.opts.abi.find(
      (item): item is AbiEvent =>
        item.type === 'event' && 'name' in item && item.name === this.opts.eventName,
    );
    if (!found) {
      throw new Error(`Event "${this.opts.eventName}" not found in ABI`);
    }
    return found;
  }
}

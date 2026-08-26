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
}

export class Poller {
  private readonly client;
  private readonly dedup = new DedupTracker();
  private readonly abiEvent: AbiEvent;
  private lastProcessedBlock: bigint | null = null;
  private isProcessing = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

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

    this.timer = setInterval(() => {
      this.poll().catch(this.opts.onError);
    }, this.opts.pollInterval);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.isProcessing || this.stopped) return;
    this.isProcessing = true;

    try {
      const currentBlock = await this.client.getBlockNumber();
      const safeBlock = currentBlock - BigInt(this.opts.confirmationBlocks);

      if (safeBlock < 0n) return;

      const fromBlock = this.lastProcessedBlock !== null
        ? this.lastProcessedBlock + 1n
        : safeBlock;

      if (fromBlock > safeBlock) return;

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

      this.lastProcessedBlock = safeBlock;
      await this.opts.store.setLastBlock(safeBlock);
    } finally {
      this.isProcessing = false;
    }
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

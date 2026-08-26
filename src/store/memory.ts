import type { BlockStore } from './interface.js';

export class InMemoryStore implements BlockStore {
  private lastBlock: bigint | null = null;

  async getLastBlock(): Promise<bigint | null> {
    return this.lastBlock;
  }

  async setLastBlock(block: bigint): Promise<void> {
    this.lastBlock = block;
  }
}

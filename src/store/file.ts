import { readFile, writeFile } from 'node:fs/promises';
import type { BlockStore } from './interface.js';

export class FileStore implements BlockStore {
  constructor(private readonly path: string) {}

  async getLastBlock(): Promise<bigint | null> {
    try {
      const raw = await readFile(this.path, 'utf-8');
      const parsed = JSON.parse(raw) as { lastBlock?: string };
      return parsed.lastBlock != null ? BigInt(parsed.lastBlock) : null;
    } catch {
      return null;
    }
  }

  async setLastBlock(block: bigint): Promise<void> {
    await writeFile(this.path, JSON.stringify({ lastBlock: block.toString() }), 'utf-8');
  }
}

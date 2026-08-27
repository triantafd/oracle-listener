import type { Collection } from 'mongodb';
import type { BlockStore } from './interface.js';

export class MongoStore implements BlockStore {
  constructor(
    private readonly collection: Collection,
    private readonly key: string = 'lastBlock',
  ) {}

  async getLastBlock(): Promise<bigint | null> {
    const doc = await this.collection.findOne({ _id: this.key } as object);
    return doc ? BigInt(doc['value'] as string) : null;
  }

  async setLastBlock(block: bigint): Promise<void> {
    await this.collection.updateOne(
      { _id: this.key } as object,
      { $set: { value: block.toString() } },
      { upsert: true },
    );
  }
}

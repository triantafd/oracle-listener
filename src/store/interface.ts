export interface BlockStore {
  getLastBlock(): Promise<bigint | null>;
  setLastBlock(block: bigint): Promise<void>;
}

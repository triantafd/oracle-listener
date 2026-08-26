export class DedupTracker {
  private seen = new Set<string>();

  has(txHash: string, logIndex: number): boolean {
    return this.seen.has(`${txHash}-${logIndex}`);
  }

  add(txHash: string, logIndex: number): void {
    this.seen.add(`${txHash}-${logIndex}`);
  }
}

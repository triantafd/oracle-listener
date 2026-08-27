import { Poller } from './poller.js';
import { InMemoryStore } from './store/memory.js';
import type { OracleListenerConfig } from './types.js';

export class OracleListener {
  private readonly poller: Poller;

  constructor(config: OracleListenerConfig) {
    const store = config.store ?? new InMemoryStore();
    const onError = config.onError ?? ((err) => console.error('[oracle-listener]', err));

    this.poller = new Poller({
      rpcUrl: config.rpcUrl,
      contractAddress: config.contractAddress,
      abi: config.abi,
      eventName: config.eventName,
      pollInterval: config.pollInterval ?? 5000,
      confirmationBlocks: config.confirmationBlocks ?? 2,
      startBlock: config.startBlock ?? 'latest',
      batchSize: config.batchSize ?? 1000,
      store,
      onEvent: config.onEvent,
      onError,
      reconnect: config.reconnect ?? true,
      reconnectInitialDelay: config.reconnectInitialDelay ?? 1000,
      reconnectMaxDelay: config.reconnectMaxDelay ?? 60000,
      reconnectMaxAttempts: config.reconnectMaxAttempts ?? 0,
      onReconnect: config.onReconnect,
    });
  }

  async start(): Promise<void> {
    await this.poller.start();
  }

  stop(): void {
    this.poller.stop();
  }
}

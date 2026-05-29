/*
mysa2mqtt
Copyright (C) 2025 Pascal Bourque

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import pino from 'pino';
import { SourceAdapter } from './types';

/**
 * Starts and stops a collection of {@link SourceAdapter}s as a unit.
 *
 * Adapters are started independently: one failing to start does not prevent the others from running, but the manager
 * still requires that at least one adapter starts successfully (otherwise the process has nothing to do and should
 * exit). On shutdown, every successfully-started adapter is stopped, and a failure to stop one does not prevent the
 * others from stopping.
 */
export class BridgeManager {
  private readonly startedAdapters: SourceAdapter[] = [];

  /**
   * @param adapters - The adapters to manage.
   * @param logger - Logger used for lifecycle messages.
   */
  constructor(
    private readonly adapters: readonly SourceAdapter[],
    private readonly logger: pino.Logger
  ) {}

  /**
   * Starts every adapter, tolerating individual failures.
   *
   * Rejects if no adapter starts successfully, since the bridge would then have nothing to do.
   *
   * @returns A promise that resolves once all adapters have started (rejects if none did).
   */
  async start(): Promise<void> {
    for (const adapter of this.adapters) {
      try {
        this.logger.info(`Starting ${adapter.displayName} adapter...`);
        await adapter.start();
        this.startedAdapters.push(adapter);
      } catch (error) {
        this.logger.error(error, `Failed to start ${adapter.displayName} adapter`);
      }
    }

    if (this.startedAdapters.length === 0) {
      throw new Error('No source adapters started successfully.');
    }

    this.logger.info(`Started ${this.startedAdapters.length} of ${this.adapters.length} adapter(s).`);
  }

  /**
   * Stops every successfully-started adapter, tolerating individual failures.
   *
   * @returns A promise that resolves once all adapters have been stopped.
   */
  async stop(): Promise<void> {
    const adaptersToStop = this.startedAdapters.splice(0);

    const results = await Promise.allSettled(
      adaptersToStop.map(async (adapter) => {
        this.logger.info(`Stopping ${adapter.displayName} adapter...`);
        await adapter.stop();
      })
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(result.reason, `Error while stopping ${adaptersToStop[index].displayName} adapter`);
      }
    });
  }
}

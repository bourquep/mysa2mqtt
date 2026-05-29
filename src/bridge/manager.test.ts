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
import { describe, expect, it } from 'vitest';
import { BridgeManager } from './manager';
import { SourceAdapter } from './types';

const silentLogger = pino({ level: 'silent' });

/** A minimal in-memory adapter used to exercise the manager without any real upstream. */
class FakeAdapter implements SourceAdapter {
  startCalls = 0;
  stopCalls = 0;

  constructor(
    readonly id: string,
    readonly displayName: string,
    private readonly behavior: { failStart?: boolean; failStop?: boolean } = {}
  ) {}

  async start(): Promise<void> {
    this.startCalls++;
    if (this.behavior.failStart) {
      throw new Error(`start failed: ${this.id}`);
    }
  }

  async stop(): Promise<void> {
    this.stopCalls++;
    if (this.behavior.failStop) {
      throw new Error(`stop failed: ${this.id}`);
    }
  }
}

describe('BridgeManager', () => {
  it('starts every adapter', async () => {
    const a = new FakeAdapter('a', 'A');
    const b = new FakeAdapter('b', 'B');
    const manager = new BridgeManager([a, b], silentLogger);

    await manager.start();

    expect(a.startCalls).toBe(1);
    expect(b.startCalls).toBe(1);
  });

  it('keeps running when some adapters fail to start, and only stops the ones that started', async () => {
    const ok = new FakeAdapter('ok', 'OK');
    const bad = new FakeAdapter('bad', 'BAD', { failStart: true });
    const manager = new BridgeManager([ok, bad], silentLogger);

    await expect(manager.start()).resolves.toBeUndefined();

    await manager.stop();
    expect(ok.stopCalls).toBe(1);
    // An adapter that never started successfully is never stopped.
    expect(bad.stopCalls).toBe(0);
  });

  it('throws when no adapter starts successfully', async () => {
    const bad = new FakeAdapter('bad', 'BAD', { failStart: true });
    const manager = new BridgeManager([bad], silentLogger);

    await expect(manager.start()).rejects.toThrow('No source adapters started successfully.');
  });

  it('stops all started adapters even if one throws while stopping', async () => {
    const a = new FakeAdapter('a', 'A', { failStop: true });
    const b = new FakeAdapter('b', 'B');
    const manager = new BridgeManager([a, b], silentLogger);

    await manager.start();

    await expect(manager.stop()).resolves.toBeUndefined();
    expect(a.stopCalls).toBe(1);
    expect(b.stopCalls).toBe(1);
  });

  it('does not stop adapters more than once across repeated stop() calls', async () => {
    const a = new FakeAdapter('a', 'A');
    const manager = new BridgeManager([a], silentLogger);

    await manager.start();
    await manager.stop();
    await manager.stop();

    expect(a.stopCalls).toBe(1);
  });
});

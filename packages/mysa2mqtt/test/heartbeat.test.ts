import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const writeFile = vi.hoisted(() => vi.fn<(path: string, data: string) => Promise<void>>());
vi.mock('fs/promises', () => ({ writeFile }));

const { createHeartbeatRecorder, HEARTBEAT_THROTTLE_MS } = await import('@/heartbeat');

/** A logger that captures warnings instead of writing them, so the failure path can be asserted on. */
function createTestLogger() {
  const warnings: string[] = [];
  const logger = { warn: (_error: unknown, message: string) => void warnings.push(message) };
  return { logger: logger as unknown as pino.Logger, warnings };
}

/** Lets the fire-and-forget promise chain inside the recorder settle. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('createHeartbeatRecorder', () => {
  beforeEach(() => {
    writeFile.mockReset();
    writeFile.mockResolvedValue(undefined);
    // Only Date is faked: the recorder's write completes on a real setImmediate turn.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-07T14:16:35.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is disabled when no heartbeat file is configured', () => {
    expect(createHeartbeatRecorder(undefined, createTestLogger().logger)).toBeUndefined();
    expect(createHeartbeatRecorder('', createTestLogger().logger)).toBeUndefined();
  });

  it('writes the current timestamp', async () => {
    const record = createHeartbeatRecorder('/run/heartbeat', createTestLogger().logger);

    record?.();
    await settle();

    expect(writeFile).toHaveBeenCalledExactlyOnceWith('/run/heartbeat', '2026-08-07T14:16:35.000Z\n');
  });

  it('throttles repeat beats inside the window', async () => {
    const record = createHeartbeatRecorder('/run/heartbeat', createTestLogger().logger);

    record?.();
    // Real-time messages can arrive several times a second; only the first should reach the disk.
    vi.setSystemTime(new Date(Date.now() + HEARTBEAT_THROTTLE_MS - 1));
    record?.();
    await settle();

    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  it('records again once the window has elapsed', async () => {
    const record = createHeartbeatRecorder('/run/heartbeat', createTestLogger().logger);

    record?.();
    vi.setSystemTime(new Date(Date.now() + HEARTBEAT_THROTTLE_MS));
    record?.();
    await settle();

    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenLastCalledWith('/run/heartbeat', '2026-08-07T14:16:45.000Z\n');
  });

  it('logs and swallows a write failure rather than rejecting', async () => {
    const { logger, warnings } = createTestLogger();
    writeFile.mockRejectedValue(new Error('ENOENT'));

    const record = createHeartbeatRecorder('/run/heartbeat', logger);

    expect(() => record?.()).not.toThrow();
    await settle();

    expect(warnings).toEqual([`Failed to write heartbeat file '/run/heartbeat'`]);
  });
});

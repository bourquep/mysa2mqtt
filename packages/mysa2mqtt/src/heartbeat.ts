/*
mysa2mqtt
Copyright (C) 2025-2026 Pascal Bourque

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

import { writeFile } from 'fs/promises';
import pino from 'pino';

/**
 * Minimum interval between two heartbeat writes.
 *
 * Real-time messages arrive far more often than a liveness probe needs, and every beat is a disk write.
 */
export const HEARTBEAT_THROTTLE_MS = 10_000;

/** Records a heartbeat. Safe to call from any code path, as often as that path runs. */
export type HeartbeatRecorder = () => void;

/**
 * Creates the heartbeat recorder that external liveness checks watch.
 *
 * The returned function writes the current timestamp to `heartbeatFile`, throttled to one write per
 * {@link HEARTBEAT_THROTTLE_MS}. Call it from every path that proves mysa2mqtt can still reach the Mysa cloud — both
 * real-time messages and successful REST polls — so that a probe watching the file's mtime measures reachability rather
 * than whether a thermostat happens to be transmitting. A thermostat that is unplugged or off the network stops the
 * real-time stream while mysa2mqtt itself is healthy, and restarting the process cannot fix that.
 *
 * Write failures are logged and swallowed: a heartbeat is diagnostic, and failing to record one must never take down
 * the bridge.
 *
 * @param heartbeatFile - Path to write, from `--heartbeat-file`. Heartbeats are disabled when undefined.
 * @param logger - Logger for write failures.
 * @returns A recorder, or undefined when no heartbeat file was configured.
 */
export function createHeartbeatRecorder(
  heartbeatFile: string | undefined,
  logger: pino.Logger
): HeartbeatRecorder | undefined {
  if (!heartbeatFile) {
    return undefined;
  }

  let lastBeat = 0;

  return () => {
    const now = Date.now();
    if (now - lastBeat < HEARTBEAT_THROTTLE_MS) {
      return;
    }

    lastBeat = now;
    writeFile(heartbeatFile, `${new Date(now).toISOString()}\n`).catch((error) => {
      logger.warn(error, `Failed to write heartbeat file '${heartbeatFile}'`);
    });
  };
}

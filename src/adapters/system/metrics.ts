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

import os from 'node:os';

/** A snapshot of host system metrics. */
export interface SystemMetrics {
  /** Host uptime in seconds. */
  uptimeSeconds: number;
  /** 1-minute load average (0 on platforms that don't report it, e.g. Windows). */
  loadAverage1m: number;
  /** Percentage of physical memory in use (0–100). */
  memoryUsedPercent: number;
  /** Free physical memory in bytes. */
  memoryFreeBytes: number;
  /** Total physical memory in bytes. */
  memoryTotalBytes: number;
}

/**
 * Computes the percentage of memory in use.
 *
 * @param totalBytes - Total physical memory in bytes.
 * @param freeBytes - Free physical memory in bytes.
 * @returns The used percentage in the range 0–100; `0` when `totalBytes` is not positive.
 */
export function computeMemoryUsedPercent(totalBytes: number, freeBytes: number): number {
  if (totalBytes <= 0) {
    return 0;
  }
  return ((totalBytes - freeBytes) / totalBytes) * 100;
}

/**
 * Collects a snapshot of the current host system metrics.
 *
 * @returns The current {@link SystemMetrics}.
 */
export function collectSystemMetrics(): SystemMetrics {
  const memoryTotalBytes = os.totalmem();
  const memoryFreeBytes = os.freemem();

  return {
    uptimeSeconds: Math.round(os.uptime()),
    loadAverage1m: os.loadavg()[0],
    memoryUsedPercent: computeMemoryUsedPercent(memoryTotalBytes, memoryFreeBytes),
    memoryFreeBytes,
    memoryTotalBytes
  };
}

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

import { describe, expect, it } from 'vitest';
import { collectSystemMetrics, computeMemoryUsedPercent } from './metrics';

describe('computeMemoryUsedPercent', () => {
  it('computes the used percentage', () => {
    expect(computeMemoryUsedPercent(100, 25)).toBe(75);
    expect(computeMemoryUsedPercent(8, 2)).toBe(75);
    expect(computeMemoryUsedPercent(100, 100)).toBe(0);
    expect(computeMemoryUsedPercent(100, 0)).toBe(100);
  });

  it('returns 0 when total memory is not positive', () => {
    expect(computeMemoryUsedPercent(0, 0)).toBe(0);
    expect(computeMemoryUsedPercent(-1, 0)).toBe(0);
  });
});

describe('collectSystemMetrics', () => {
  it('returns sane, finite metrics for the host', () => {
    const metrics = collectSystemMetrics();

    expect(metrics.memoryTotalBytes).toBeGreaterThan(0);
    expect(metrics.memoryFreeBytes).toBeGreaterThanOrEqual(0);
    expect(metrics.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(metrics.loadAverage1m)).toBe(true);
    expect(metrics.memoryUsedPercent).toBeGreaterThanOrEqual(0);
    expect(metrics.memoryUsedPercent).toBeLessThanOrEqual(100);
  });
});

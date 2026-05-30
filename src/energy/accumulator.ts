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

/** Number of milliseconds in an hour, used to convert watt-milliseconds into watt-hours. */
const MS_PER_HOUR = 3_600_000;

/**
 * Accumulates energy (in kWh) by integrating a series of instantaneous power readings over time.
 *
 * Each reading is assumed to hold until the next one (a left-hand Riemann sum): the previously reported power is
 * applied across the interval up to the new sample. This is the same approach Home Assistant's own "Riemann sum
 * integral" helper uses to derive energy from a power sensor.
 *
 * The running total is monotonically increasing, which matches a Home Assistant `total_increasing` energy sensor. The
 * total starts at zero and is not persisted across restarts.
 */
export class EnergyAccumulator {
  private totalKwh = 0;
  private lastWatts?: number;
  private lastTimestampMs?: number;

  /** @returns The accumulated energy in kWh. */
  get kwh(): number {
    return this.totalKwh;
  }

  /**
   * Adds a power reading and integrates the previous reading over the elapsed interval.
   *
   * Samples with a timestamp at or before the previous one are recorded but contribute no energy (guarding against
   * clock skew or out-of-order updates).
   *
   * @param watts - The instantaneous power reading, in watts.
   * @param timestampMs - The time of the reading, in epoch milliseconds.
   * @returns The updated accumulated energy in kWh.
   */
  addSample(watts: number, timestampMs: number): number {
    if (this.lastTimestampMs != null && this.lastWatts != null && timestampMs > this.lastTimestampMs) {
      const hours = (timestampMs - this.lastTimestampMs) / MS_PER_HOUR;
      this.totalKwh += (this.lastWatts * hours) / 1000;
    }

    this.lastWatts = watts;
    this.lastTimestampMs = timestampMs;

    return this.totalKwh;
  }
}

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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PowerEnergyPublisher } from './power-energy-publisher';

/** Records every Sensor constructed and the states it publishes, keyed by `unique_id` suffix. */
const sensorRegistry = new Map<string, { states: { topic: string; state: string }[]; availability: boolean[] }>();

vi.mock('mqtt2ha', () => {
  class FakeSensor {
    private readonly suffix: string;
    constructor(settings: { component: { unique_id: string } }) {
      // Track by the trailing suffix (e.g. `_power`, `_energy`, `_cost`) for easy assertions.
      this.suffix = settings.component.unique_id.replace(/^.*?(_[a-z]+)$/, '$1');
      sensorRegistry.set(this.suffix, { states: [], availability: [] });
    }
    async writeConfig() {}
    async setState(topic: string, state: string) {
      sensorRegistry.get(this.suffix)!.states.push({ topic, state });
    }
    async setAvailability(value: boolean) {
      sensorRegistry.get(this.suffix)!.availability.push(value);
    }
  }
  return { Sensor: FakeSensor };
});

const baseOptions = {
  mqtt: { host: 'localhost' },
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  device: { identifiers: 'dev' },
  origin: { name: 'mysa2mqtt' },
  uniqueIdPrefix: 'dev'
} as unknown as ConstructorParameters<typeof PowerEnergyPublisher>[0];

const lastState = (suffix: string) => {
  const states = sensorRegistry.get(suffix)?.states ?? [];
  return states[states.length - 1]?.state;
};

const HOUR = 3_600_000;

describe('PowerEnergyPublisher', () => {
  beforeEach(() => sensorRegistry.clear());

  it('creates power and energy sensors but no cost sensor when no rate is supplied', () => {
    const publisher = new PowerEnergyPublisher(baseOptions);
    expect(publisher.hasCost).toBe(false);
    expect(sensorRegistry.has('_power')).toBe(true);
    expect(sensorRegistry.has('_energy')).toBe(true);
    expect(sensorRegistry.has('_cost')).toBe(false);
  });

  it('creates a cost sensor only when a rate is supplied', () => {
    const publisher = new PowerEnergyPublisher({ ...baseOptions, costPerKwh: 0.15 });
    expect(publisher.hasCost).toBe(true);
    expect(sensorRegistry.has('_cost')).toBe(true);
  });

  it('derives energy by integrating power over time', async () => {
    const publisher = new PowerEnergyPublisher(baseOptions);
    await publisher.updatePower(1000, 0);
    await publisher.updatePower(1000, HOUR); // 1000 W for 1 h => 1 kWh
    expect(lastState('_power')).toBe('1000.00');
    expect(lastState('_energy')).toBe('1.000');
  });

  it('publishes None for power and holds energy when power is unavailable', async () => {
    const publisher = new PowerEnergyPublisher(baseOptions);
    await publisher.updatePower(1000, 0);
    await publisher.updatePower(null, HOUR);
    expect(lastState('_power')).toBe('None');
    // Energy was only published from the first (initial) sample, which contributes nothing yet.
    expect(lastState('_energy')).toBe('0.000');
  });

  it('publishes a measured energy total as-is', async () => {
    const publisher = new PowerEnergyPublisher(baseOptions);
    await publisher.updatePowerAndEnergy(2400, 25);
    expect(lastState('_power')).toBe('2400.00');
    expect(lastState('_energy')).toBe('25.000');
  });

  it('computes cost as energy × rate when a rate is supplied (derived energy)', async () => {
    const publisher = new PowerEnergyPublisher({ ...baseOptions, costPerKwh: 0.2 });
    await publisher.updatePower(1000, 0);
    await publisher.updatePower(1000, 2 * HOUR); // 2 kWh
    expect(lastState('_energy')).toBe('2.000');
    expect(lastState('_cost')).toBe('0.4000'); // 2 kWh × $0.20
  });

  it('computes cost for a measured energy total', async () => {
    const publisher = new PowerEnergyPublisher({ ...baseOptions, costPerKwh: 0.1, currency: '€' });
    await publisher.updatePowerAndEnergy(1000, 50);
    expect(lastState('_cost')).toBe('5.0000'); // 50 kWh × €0.10
  });

  it('marks all entities unavailable', async () => {
    const publisher = new PowerEnergyPublisher({ ...baseOptions, costPerKwh: 0.15 });
    await publisher.setUnavailable();
    expect(sensorRegistry.get('_power')?.availability).toEqual([false]);
    expect(sensorRegistry.get('_energy')?.availability).toEqual([false]);
    expect(sensorRegistry.get('_cost')?.availability).toEqual([false]);
  });
});

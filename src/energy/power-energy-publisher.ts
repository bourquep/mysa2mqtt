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

import { DeviceConfiguration, Logger, MqttSettings, OriginConfiguration, Sensor } from 'mqtt2ha';
import { EnergyAccumulator } from './accumulator';

/** Settings for a {@link PowerEnergyPublisher}. */
export interface PowerEnergyPublisherOptions {
  /** Shared MQTT connection settings. */
  mqtt: MqttSettings;
  /** Logger for the created entities. */
  logger: Logger;
  /** The Home Assistant device the entities belong to. */
  device: DeviceConfiguration;
  /** The origin metadata for the entities. */
  origin: OriginConfiguration;
  /** A prefix for the entities' `unique_id`s (e.g. `mysa_<id>` or `shelly_em_<host>`). */
  uniqueIdPrefix: string;
  /** A human-readable name prefix for the entities (e.g. `''` or `Charger`). Trimmed; empty means bare names. */
  namePrefix?: string;
  /**
   * Optional electricity rate, in currency units per kWh. When supplied, a cost sensor is created and tracked; when
   * omitted, **no cost entity is created** — downstream (e.g. the Home Assistant Energy dashboard) can apply the rate
   * itself. This keeps the bridge from inventing a rate it doesn't know.
   */
  costPerKwh?: number;
  /**
   * The currency unit symbol for the cost sensor's unit of measurement (e.g. `$`, `€`). Only used when `costPerKwh` is
   * set. Defaults to a generic `$`.
   */
  currency?: string;
}

/**
 * Publishes the project's standard electricity-usage entities for a device: a **power** (W) sensor, a cumulative
 * **energy** (kWh, `total_increasing`) sensor, and — only when a rate is supplied — a **cost** sensor.
 *
 * Two energy modes are supported:
 *
 * - **Derived** ({@link updatePower}): the publisher integrates the power readings over time (Riemann sum) to produce
 *   energy. Use this for sources that report instantaneous power but no cumulative energy (e.g. a thermostat or the
 *   Tesla Wall Connector's live vitals).
 * - **Measured** ({@link updatePowerAndEnergy}): the device already reports a cumulative kWh total, which is published
 *   as-is. Use this for true energy meters (e.g. Shelly EM).
 *
 * Cost, when enabled, is always `energyKwh × costPerKwh`, so it stays consistent with whichever energy mode is used.
 */
export class PowerEnergyPublisher {
  private readonly powerSensor: Sensor;
  private readonly energySensor: Sensor;
  private readonly costSensor?: Sensor;
  private readonly accumulator = new EnergyAccumulator();

  /** @param options - The publisher configuration. */
  constructor(private readonly options: PowerEnergyPublisherOptions) {
    const namePrefix = options.namePrefix?.trim();
    const name = (base: string) => (namePrefix ? `${namePrefix} ${base}` : base);

    this.powerSensor = new Sensor({
      mqtt: options.mqtt,
      logger: options.logger,
      component: {
        component: 'sensor',
        device: options.device,
        origin: options.origin,
        unique_id: `${options.uniqueIdPrefix}_power`,
        name: name('Power'),
        device_class: 'power',
        state_class: 'measurement',
        unit_of_measurement: 'W',
        suggested_display_precision: 0,
        force_update: true
      }
    });

    this.energySensor = new Sensor({
      mqtt: options.mqtt,
      logger: options.logger,
      component: {
        component: 'sensor',
        device: options.device,
        origin: options.origin,
        unique_id: `${options.uniqueIdPrefix}_energy`,
        name: name('Energy'),
        device_class: 'energy',
        state_class: 'total_increasing',
        unit_of_measurement: 'kWh',
        suggested_display_precision: 3
      }
    });

    if (options.costPerKwh != null) {
      const currency = options.currency ?? '$';
      this.costSensor = new Sensor({
        mqtt: options.mqtt,
        logger: options.logger,
        component: {
          component: 'sensor',
          device: options.device,
          origin: options.origin,
          unique_id: `${options.uniqueIdPrefix}_cost`,
          name: name('Cost'),
          device_class: 'monetary',
          state_class: 'total_increasing',
          unit_of_measurement: currency,
          suggested_display_precision: 2
        }
      });
    }
  }

  /** @returns Whether a cost sensor is being published (a rate was supplied). */
  get hasCost(): boolean {
    return this.costSensor != null;
  }

  /** Writes Home Assistant discovery config for all created entities. */
  async writeConfig(): Promise<void> {
    await this.powerSensor.writeConfig();
    await this.energySensor.writeConfig();
    await this.costSensor?.writeConfig();
  }

  /**
   * Publishes a power reading and the energy **derived** from it by integrating over time.
   *
   * @param watts - The instantaneous power, in watts, or `undefined`/`null` when unavailable (publishes `None` for
   *   power and leaves the energy total unchanged).
   * @param timestampMs - The reading time in epoch milliseconds (defaults to now).
   */
  async updatePower(watts: number | undefined | null, timestampMs: number = Date.now()): Promise<void> {
    if (watts == null) {
      await this.powerSensor.setState('state_topic', 'None');
      return;
    }

    await this.powerSensor.setState('state_topic', watts.toFixed(2));
    const kwh = this.accumulator.addSample(watts, timestampMs);
    await this.publishEnergy(kwh);
  }

  /**
   * Publishes a power reading and a **measured** cumulative energy total reported by the device.
   *
   * @param watts - The instantaneous power, in watts, or `undefined`/`null` when unavailable.
   * @param energyKwh - The device's cumulative energy total, in kWh, or `undefined`/`null` when unavailable.
   */
  async updatePowerAndEnergy(watts: number | undefined | null, energyKwh: number | undefined | null): Promise<void> {
    await this.powerSensor.setState('state_topic', watts != null ? watts.toFixed(2) : 'None');
    if (energyKwh != null) {
      await this.publishEnergy(energyKwh);
    }
  }

  /**
   * Publishes the energy total and, if enabled, the corresponding cost.
   *
   * @param kwh - The cumulative energy in kWh.
   */
  private async publishEnergy(kwh: number): Promise<void> {
    await this.energySensor.setState('state_topic', kwh.toFixed(3));
    if (this.costSensor && this.options.costPerKwh != null) {
      await this.costSensor.setState('state_topic', (kwh * this.options.costPerKwh).toFixed(4));
    }
  }

  /** Marks all created entities unavailable (e.g. on shutdown). */
  async setUnavailable(): Promise<void> {
    await Promise.all([
      this.powerSensor.setAvailability(false),
      this.energySensor.setAvailability(false),
      this.costSensor?.setAvailability(false) ?? Promise.resolve()
    ]);
  }
}

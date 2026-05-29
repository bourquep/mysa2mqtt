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

import { DeviceConfiguration, MqttSettings, OriginConfiguration, Sensor } from 'mqtt2ha';
import pino from 'pino';
import { SourceAdapter } from '../../bridge/types';
import { PinoLogger } from '../../logger';
import { version } from '../../version';
import { ShellyEmClient } from './client';

/** Default interval, in milliseconds, between Shelly polls. */
const DEFAULT_REFRESH_INTERVAL_MS = 15_000;

/** Configuration required by the {@link ShellyEmAdapter}. */
export interface ShellyEmConfig {
  /** Hostname or IP of the Shelly energy meter (with or without scheme). */
  host: string;
  /** The EM/EM1 component id to read (Gen2 only; default 0). */
  channelId?: number;
}

/**
 * Bridges a Shelly energy meter (Pro 3EM / EM / Gen1 EM) to MQTT / Home Assistant.
 *
 * Shelly EM devices are whole-circuit/whole-home electricity monitors, so this adapter sits at the center of the
 * project's energy-usage mission. It polls the device's **local** HTTP API (auto-detecting Gen2 vs Gen1) and publishes
 * total power, current, voltage, cumulative energy (kWh, `total_increasing`), and per-channel power as Home Assistant
 * sensors. Per-phase channel sensors are created lazily as the device reports them.
 */
export class ShellyEmAdapter implements SourceAdapter {
  readonly id = 'shelly_em';
  readonly displayName = 'Shelly energy meter';

  private readonly client: ShellyEmClient;

  private power?: Sensor;
  private current?: Sensor;
  private voltage?: Sensor;
  private energy?: Sensor;
  private returnedEnergy?: Sensor;
  private readonly channelSensors: Sensor[] = [];

  private device!: DeviceConfiguration;
  private origin!: OriginConfiguration;
  private identifier!: string;

  private readonly sensors: Sensor[] = [];
  private timer?: NodeJS.Timeout;

  /**
   * @param config - Shelly connection configuration.
   * @param mqttSettings - Shared MQTT connection settings.
   * @param logger - Logger scoped to this adapter.
   * @param refreshIntervalMs - How often to poll, in milliseconds.
   * @param fetcher - The fetch implementation to use (injectable for testing).
   */
  constructor(
    private readonly config: ShellyEmConfig,
    private readonly mqttSettings: MqttSettings,
    private readonly logger: pino.Logger,
    private readonly refreshIntervalMs: number = DEFAULT_REFRESH_INTERVAL_MS,
    fetcher: typeof fetch = fetch
  ) {
    this.client = new ShellyEmClient(config.host, fetcher, config.channelId ?? 0);
  }

  /** Detects the device, registers the Home Assistant sensors, publishes an initial reading, and starts polling. */
  async start(): Promise<void> {
    const variant = await this.client.detectVariant();
    this.logger.info(`Detected Shelly energy meter (${variant}) at ${this.config.host}.`);

    this.identifier = `shelly_em_${this.config.host.replace(/[^a-zA-Z0-9]/g, '_')}`;
    this.device = {
      identifiers: this.identifier,
      name: 'Shelly energy meter',
      manufacturer: 'Shelly',
      model: variant
    };
    this.origin = {
      name: 'mysa2mqtt',
      sw_version: version,
      support_url: 'https://github.com/bourquep/mysa2mqtt'
    };

    this.power = this.makeSensor('power', 'Power', {
      device_class: 'power',
      state_class: 'measurement',
      unit_of_measurement: 'W',
      suggested_display_precision: 1
    });
    this.current = this.makeSensor('current', 'Current', {
      device_class: 'current',
      state_class: 'measurement',
      unit_of_measurement: 'A',
      suggested_display_precision: 2
    });
    this.voltage = this.makeSensor('voltage', 'Voltage', {
      device_class: 'voltage',
      state_class: 'measurement',
      unit_of_measurement: 'V',
      suggested_display_precision: 0
    });
    this.energy = this.makeSensor('energy', 'Energy', {
      device_class: 'energy',
      state_class: 'total_increasing',
      unit_of_measurement: 'kWh',
      suggested_display_precision: 3
    });
    this.returnedEnergy = this.makeSensor('energy_returned', 'Energy returned', {
      device_class: 'energy',
      state_class: 'total_increasing',
      unit_of_measurement: 'kWh',
      suggested_display_precision: 3,
      enabled_by_default: false
    });

    for (const sensor of this.sensors) {
      await sensor.writeConfig();
    }

    await this.poll();

    this.timer = setInterval(() => {
      this.poll().catch((error) => this.logger.error(error, 'Failed to poll Shelly energy meter'));
    }, this.refreshIntervalMs);
    // Don't let the poll timer keep the process alive on its own.
    this.timer.unref();

    this.logger.info(`Polling Shelly energy meter every ${Math.round(this.refreshIntervalMs / 1000)}s.`);
  }

  /**
   * Creates a sensor, registers it for lifecycle management, and returns it.
   *
   * @param suffix - The unique-id suffix.
   * @param name - The Home Assistant entity name.
   * @param extra - Additional component configuration.
   * @returns The created sensor.
   */
  private makeSensor(suffix: string, name: string, extra: Record<string, unknown>): Sensor {
    const sensor = new Sensor({
      mqtt: this.mqttSettings,
      logger: new PinoLogger(this.logger.child({ module: 'shelly-em', entity: suffix })),
      component: {
        component: 'sensor',
        device: this.device,
        origin: this.origin,
        unique_id: `${this.identifier}_${suffix}`,
        name,
        force_update: true,
        ...extra
      }
    });
    this.sensors.push(sensor);
    return sensor;
  }

  /**
   * Ensures a per-channel power sensor exists for the given index, creating and configuring it on first use.
   *
   * @param index - The zero-based channel/phase index.
   * @returns The channel's power sensor.
   */
  private async channelSensorFor(index: number): Promise<Sensor> {
    const existing = this.channelSensors[index];
    if (existing) {
      return existing;
    }

    const label = String.fromCharCode('A'.charCodeAt(0) + index);
    const sensor = this.makeSensor(`power_${index}`, `Power phase ${label}`, {
      device_class: 'power',
      state_class: 'measurement',
      unit_of_measurement: 'W',
      suggested_display_precision: 1
    });
    this.channelSensors[index] = sensor;
    await sensor.writeConfig();
    return sensor;
  }

  /** Fetches the latest reading and publishes it. */
  private async poll(): Promise<void> {
    const reading = await this.client.getReading();

    await this.setNumeric(this.power, reading.totalPowerWatts, 1);
    await this.setNumeric(this.current, reading.totalCurrentAmps, 2);
    await this.setNumeric(this.voltage, reading.voltage, 0);
    await this.setNumeric(this.energy, reading.totalEnergyKwh, 3);
    await this.setNumeric(this.returnedEnergy, reading.totalReturnedEnergyKwh, 3);

    for (let index = 0; index < reading.channelPowerWatts.length; index++) {
      const sensor = await this.channelSensorFor(index);
      await sensor.setState('state_topic', reading.channelPowerWatts[index].toFixed(1));
    }
  }

  /**
   * Publishes a numeric sensor value, or `None` when the value is unavailable.
   *
   * @param sensor - The sensor to update.
   * @param value - The value, or `undefined` when unavailable.
   * @param fractionDigits - Decimal places to format with.
   */
  private async setNumeric(
    sensor: Sensor | undefined,
    value: number | undefined,
    fractionDigits: number
  ): Promise<void> {
    if (!sensor) {
      return;
    }
    await sensor.setState('state_topic', value != null ? value.toFixed(fractionDigits) : 'None');
  }

  /** Stops the poll timer and marks the sensors unavailable. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    await Promise.all(this.sensors.map((sensor) => sensor.setAvailability(false)));
  }
}

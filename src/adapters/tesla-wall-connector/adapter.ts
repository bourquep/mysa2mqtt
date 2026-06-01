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

import { BinarySensor, DeviceConfiguration, MqttSettings, OriginConfiguration, Sensor } from 'mqtt2ha';
import pino from 'pino';
import { OutputPolicy } from '../../bridge/output-policy';
import { SourceAdapter } from '../../bridge/types';
import { PinoLogger } from '../../logger';
import { version } from '../../version';
import { TeslaWallConnectorClient } from './client';
import { normalizeWallConnectorState } from './vitals';

/** Default interval, in milliseconds, between Wall Connector polls. */
const DEFAULT_REFRESH_INTERVAL_MS = 30_000;

/** Configuration required by the {@link TeslaWallConnectorAdapter}. */
export interface TeslaWallConnectorConfig {
  /** Hostname or IP of the Wall Connector (with or without scheme). */
  host: string;
}

/**
 * Bridges a Tesla Wall Connector (Gen 3) to MQTT / Home Assistant.
 *
 * Polls the Wall Connector's local, unauthenticated JSON API and publishes power, current, voltage, session, and
 * vehicle-connected/charging state as Home Assistant entities. This is **monitor-only**: the local API exposes no
 * control (start/stop, charge-rate), so no command entities are created (see `docs/SOURCE_RESEARCH.md`).
 */
export class TeslaWallConnectorAdapter implements SourceAdapter {
  readonly id = 'tesla_wall_connector';
  readonly displayName = 'Tesla Wall Connector';

  private readonly client: TeslaWallConnectorClient;

  private vehicleConnected?: BinarySensor;
  private charging?: BinarySensor;
  private power?: Sensor;
  private current?: Sensor;
  private gridVoltage?: Sensor;
  private session?: Sensor;
  private handleTemp?: Sensor;
  private lifetimeEnergy?: Sensor;

  private readonly sensors: Sensor[] = [];
  private readonly binarySensors: BinarySensor[] = [];
  private timer?: NodeJS.Timeout;
  private lifetimeAvailable = true;

  /**
   * @param config - Wall Connector connection configuration.
   * @param mqttSettings - Shared MQTT connection settings.
   * @param logger - Logger scoped to this adapter.
   * @param refreshIntervalMs - How often to poll, in milliseconds.
   * @param fetcher - The fetch implementation to use (injectable for testing).
   */
  constructor(
    private readonly config: TeslaWallConnectorConfig,
    private readonly mqttSettings: MqttSettings,
    private readonly logger: pino.Logger,
    private readonly policy: OutputPolicy = OutputPolicy.unrestricted(),
    private readonly refreshIntervalMs: number = DEFAULT_REFRESH_INTERVAL_MS,
    fetcher: typeof fetch = fetch
  ) {
    this.client = new TeslaWallConnectorClient(config.host, fetcher);
  }

  /** Registers the Home Assistant entities, publishes an initial reading, and starts the poll timer. */
  async start(): Promise<void> {
    const identifier = `tesla_wall_connector_${this.config.host.replace(/[^a-zA-Z0-9]/g, '_')}`;

    const device: DeviceConfiguration = {
      identifiers: identifier,
      name: 'Tesla Wall Connector',
      manufacturer: 'Tesla',
      model: 'Wall Connector (Gen 3)'
    };

    const origin: OriginConfiguration = {
      name: 'mysa2mqtt',
      sw_version: version,
      support_url: 'https://github.com/bourquep/mysa2mqtt'
    };

    const makeSensor = (suffix: string, name: string, extra: Record<string, unknown>): Sensor => {
      const sensor = new Sensor({
        mqtt: this.mqttSettings,
        logger: new PinoLogger(this.logger.child({ module: 'tesla-wall-connector', entity: suffix })),
        component: {
          component: 'sensor',
          device,
          origin,
          unique_id: `${identifier}_${suffix}`,
          name,
          force_update: true,
          ...extra
        }
      });
      this.sensors.push(sensor);
      return sensor;
    };

    const makeBinarySensor = (suffix: string, name: string, extra: Record<string, unknown>): BinarySensor => {
      const sensor = new BinarySensor({
        mqtt: this.mqttSettings,
        logger: new PinoLogger(this.logger.child({ module: 'tesla-wall-connector', entity: suffix })),
        component: {
          component: 'binary_sensor',
          device,
          origin,
          unique_id: `${identifier}_${suffix}`,
          name,
          ...extra
        }
      });
      this.binarySensors.push(sensor);
      return sensor;
    };

    // Energy / electrical measurements — always published.
    this.power = makeSensor('power', 'Power', {
      device_class: 'power',
      state_class: 'measurement',
      unit_of_measurement: 'W',
      suggested_display_precision: 0
    });
    this.current = makeSensor('current', 'Current', {
      device_class: 'current',
      state_class: 'measurement',
      unit_of_measurement: 'A',
      suggested_display_precision: 1
    });
    this.gridVoltage = makeSensor('grid_voltage', 'Grid voltage', {
      device_class: 'voltage',
      state_class: 'measurement',
      unit_of_measurement: 'V',
      suggested_display_precision: 0
    });
    this.lifetimeEnergy = makeSensor('lifetime_energy', 'Lifetime energy', {
      device_class: 'energy',
      state_class: 'total_increasing',
      unit_of_measurement: 'kWh',
      suggested_display_precision: 1
    });

    // Non-energy telemetry (vehicle/charging state, session, handle temperature) — suppressed in energy-only mode.
    if (this.policy.allowsTelemetry) {
      this.vehicleConnected = makeBinarySensor('vehicle_connected', 'Vehicle connected', { device_class: 'plug' });
      this.charging = makeBinarySensor('charging', 'Charging', { device_class: 'battery_charging' });
      this.session = makeSensor('session', 'Session duration', {
        device_class: 'duration',
        state_class: 'measurement',
        unit_of_measurement: 's',
        suggested_display_precision: 0
      });
      this.handleTemp = makeSensor('handle_temperature', 'Handle temperature', {
        device_class: 'temperature',
        state_class: 'measurement',
        unit_of_measurement: '°C',
        suggested_display_precision: 1
      });
    }

    for (const sensor of this.sensors) {
      await sensor.writeConfig();
    }
    for (const sensor of this.binarySensors) {
      await sensor.writeConfig();
    }

    await this.poll();

    this.timer = setInterval(() => {
      this.poll().catch((error) => this.logger.error(error, 'Failed to poll Tesla Wall Connector'));
    }, this.refreshIntervalMs);
    // Don't let the poll timer keep the process alive on its own.
    this.timer.unref();

    this.logger.info(
      `Polling Tesla Wall Connector at ${this.config.host} every ${Math.round(this.refreshIntervalMs / 1000)}s.`
    );
  }

  /** Fetches the latest vitals (and lifetime, if available) and publishes them. */
  private async poll(): Promise<void> {
    const vitals = await this.client.getVitals();

    // `/api/1/lifetime` may not exist on all firmware; degrade gracefully and stop retrying it if it fails.
    let lifetime;
    if (this.lifetimeAvailable) {
      try {
        lifetime = await this.client.getLifetime();
      } catch (error) {
        this.lifetimeAvailable = false;
        this.logger.debug(`Tesla Wall Connector lifetime endpoint unavailable; skipping it: ${this.errorText(error)}`);
      }
    }

    const state = normalizeWallConnectorState(vitals, lifetime);

    await this.setBinary(this.vehicleConnected, state.vehicleConnected);
    await this.setBinary(this.charging, state.charging);
    await this.setNumeric(this.power, state.power, 0);
    await this.setNumeric(this.current, state.totalCurrent, 1);
    await this.setNumeric(this.gridVoltage, state.gridVoltage, 0);
    await this.setNumeric(this.session, state.sessionSeconds, 0);
    await this.setNumeric(this.handleTemp, state.handleTemperature, 1);
    await this.setNumeric(this.lifetimeEnergy, state.lifetimeEnergyKwh, 3);
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

  /**
   * Publishes a binary sensor value when known.
   *
   * @param sensor - The binary sensor to update.
   * @param value - The boolean value, or `undefined` when unknown.
   */
  private async setBinary(sensor: BinarySensor | undefined, value: boolean | undefined): Promise<void> {
    if (!sensor || value == null) {
      return;
    }
    await (value ? sensor.on() : sensor.off());
  }

  /**
   * Renders an error as a short string.
   *
   * @param error - The error.
   * @returns A human-readable message.
   */
  private errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /** Stops the poll timer and marks the entities unavailable. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    await Promise.all([
      ...this.sensors.map((sensor) => sensor.setAvailability(false)),
      ...this.binarySensors.map((sensor) => sensor.setAvailability(false))
    ]);
  }
}

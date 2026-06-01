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

import { DeviceConfiguration, MqttSettings, OriginConfiguration, Sensor, Switch } from 'mqtt2ha';
import pino from 'pino';
import { OutputPolicy } from '../../bridge/output-policy';
import { SourceAdapter } from '../../bridge/types';
import { PowerEnergyPublisher } from '../../energy/power-energy-publisher';
import { PinoLogger } from '../../logger';
import { version } from '../../version';
import { ShellyPlugClient } from './client';

/** Default interval, in milliseconds, between Shelly plug polls. */
const DEFAULT_REFRESH_INTERVAL_MS = 15_000;

/** Configuration required by the {@link ShellyPlugAdapter}. */
export interface ShellyPlugConfig {
  /** Hostname or IP of the Shelly plug (with or without scheme). */
  host: string;
  /** The switch/relay channel id (default 0). */
  channelId?: number;
  /** Optional electricity rate per kWh; when set, a cost sensor is published. */
  costPerKwh?: number;
  /** Currency symbol for the cost sensor (only used when `costPerKwh` is set). */
  currency?: string;
}

/**
 * Bridges a Shelly smart plug (a metered relay) to MQTT / Home Assistant.
 *
 * Feature-rich by default: it publishes the standard power + energy (+ optional cost) entities via the shared
 * {@link PowerEnergyPublisher}, plus voltage/current/temperature sensors, **and a controllable on/off switch**.
 *
 * The on/off switch — and the non-energy telemetry (voltage/current/temperature) — are created **only when the bridge's
 * {@link OutputPolicy} permits** the corresponding category. In energy-only ("safety switch") mode, the plug is reduced
 * to power + energy (+ cost) and exposes no control surface.
 */
export class ShellyPlugAdapter implements SourceAdapter {
  readonly id = 'shelly_plug';
  readonly displayName = 'Shelly plug';

  private readonly client: ShellyPlugClient;

  private powerEnergy?: PowerEnergyPublisher;
  private voltage?: Sensor;
  private current?: Sensor;
  private temperature?: Sensor;
  private outputSwitch?: Switch;

  private device!: DeviceConfiguration;
  private origin!: OriginConfiguration;
  private identifier!: string;

  private readonly sensors: Sensor[] = [];
  private timer?: NodeJS.Timeout;

  /**
   * @param config - Shelly plug connection configuration.
   * @param mqttSettings - Shared MQTT connection settings.
   * @param logger - Logger scoped to this adapter.
   * @param policy - The bridge output policy (the energy-only "safety switch").
   * @param refreshIntervalMs - How often to poll, in milliseconds.
   * @param fetcher - The fetch implementation to use (injectable for testing).
   */
  constructor(
    private readonly config: ShellyPlugConfig,
    private readonly mqttSettings: MqttSettings,
    private readonly logger: pino.Logger,
    private readonly policy: OutputPolicy = OutputPolicy.unrestricted(),
    private readonly refreshIntervalMs: number = DEFAULT_REFRESH_INTERVAL_MS,
    fetcher: typeof fetch = fetch
  ) {
    this.client = new ShellyPlugClient(config.host, fetcher, config.channelId ?? 0);
  }

  /** Detects the plug, registers the permitted entities, publishes an initial reading, and starts polling. */
  async start(): Promise<void> {
    const variant = await this.client.detectVariant();
    this.logger.info(`Detected Shelly plug (${variant}) at ${this.config.host}.`);

    this.identifier = `shelly_plug_${this.config.host.replace(/[^a-zA-Z0-9]/g, '_')}`;
    this.device = {
      identifiers: this.identifier,
      name: 'Shelly plug',
      manufacturer: 'Shelly',
      model: variant
    };
    this.origin = {
      name: 'mysa2mqtt',
      sw_version: version,
      support_url: 'https://github.com/bourquep/mysa2mqtt'
    };

    // Energy is always published (it is the core of the bridge's mission and the only thing allowed in energy-only mode).
    this.powerEnergy = new PowerEnergyPublisher({
      mqtt: this.mqttSettings,
      logger: new PinoLogger(this.logger.child({ module: 'shelly-plug', entity: 'power-energy' })),
      device: this.device,
      origin: this.origin,
      uniqueIdPrefix: this.identifier,
      costPerKwh: this.config.costPerKwh,
      currency: this.config.currency
    });
    await this.powerEnergy.writeConfig();

    // Voltage/current/temperature are non-energy *electrical* context; treat them as telemetry so energy-only mode
    // stays strictly power+energy+cost.
    if (this.policy.allowsTelemetry) {
      this.voltage = this.makeSensor('voltage', 'Voltage', {
        device_class: 'voltage',
        state_class: 'measurement',
        unit_of_measurement: 'V',
        suggested_display_precision: 0
      });
      this.current = this.makeSensor('current', 'Current', {
        device_class: 'current',
        state_class: 'measurement',
        unit_of_measurement: 'A',
        suggested_display_precision: 2
      });
      this.temperature = this.makeSensor('temperature', 'Device temperature', {
        device_class: 'temperature',
        state_class: 'measurement',
        unit_of_measurement: '°C',
        suggested_display_precision: 1,
        entity_category: 'diagnostic'
      });
      for (const sensor of this.sensors) {
        await sensor.writeConfig();
      }
    }

    // The on/off relay is control — only created when the policy allows it.
    if (this.policy.allowsControl) {
      this.outputSwitch = new Switch(
        {
          mqtt: this.mqttSettings,
          logger: new PinoLogger(this.logger.child({ module: 'shelly-plug', entity: 'switch' })),
          component: {
            component: 'switch',
            device: this.device,
            origin: this.origin,
            unique_id: `${this.identifier}_switch`,
            name: 'Plug',
            device_class: 'outlet'
          }
        },
        async (_topic, message) => {
          try {
            await this.client.setOutput(message === 'ON');
          } catch (error) {
            this.logger.error(error, 'Failed to set Shelly plug output');
          }
        }
      );
      await this.outputSwitch.writeConfig();
    } else {
      this.logger.info('Energy-only mode: Shelly plug on/off control is disabled.');
    }

    await this.poll();

    this.timer = setInterval(() => {
      this.poll().catch((error) => this.logger.error(error, 'Failed to poll Shelly plug'));
    }, this.refreshIntervalMs);
    // Don't let the poll timer keep the process alive on its own.
    this.timer.unref();

    this.logger.info(`Polling Shelly plug every ${Math.round(this.refreshIntervalMs / 1000)}s.`);
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
      logger: new PinoLogger(this.logger.child({ module: 'shelly-plug', entity: suffix })),
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

  /** Fetches the latest reading and publishes the permitted entities. */
  private async poll(): Promise<void> {
    const reading = await this.client.getReading();

    // The Shelly plug reports a cumulative energy total, so use the "measured" energy path.
    await this.powerEnergy?.updatePowerAndEnergy(reading.powerWatts, reading.totalEnergyKwh);

    await this.setNumeric(this.voltage, reading.voltage, 0);
    await this.setNumeric(this.current, reading.currentAmps, 2);
    await this.setNumeric(this.temperature, reading.temperatureC, 1);

    if (this.outputSwitch && reading.output != null) {
      await (reading.output ? this.outputSwitch.on() : this.outputSwitch.off());
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

  /** Stops the poll timer and marks the entities unavailable. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    await Promise.all([
      this.powerEnergy?.setUnavailable() ?? Promise.resolve(),
      this.outputSwitch?.setAvailability(false) ?? Promise.resolve(),
      ...this.sensors.map((sensor) => sensor.setAvailability(false))
    ]);
  }
}

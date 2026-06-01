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

import { connectAsync, IClientOptions, MqttClient } from 'mqtt';
import { DeviceConfiguration, MqttSettings, OriginConfiguration, Sensor, Switch } from 'mqtt2ha';
import pino from 'pino';
import { OutputPolicy } from '../../bridge/output-policy';
import { SourceAdapter } from '../../bridge/types';
import { PowerEnergyPublisher } from '../../energy/power-energy-publisher';
import { PinoLogger } from '../../logger';
import { version } from '../../version';
import { parseTasmotaPayload, tasmotaTopics } from './payload';

/** A minimal MQTT subscriber interface, satisfied by an `mqtt` client (injectable for testing). */
export interface MqttSubscriber {
  subscribeAsync(topic: string | string[]): Promise<unknown>;
  publishAsync(topic: string, message: string): Promise<unknown>;
  on(event: 'message', handler: (topic: string, payload: Buffer) => void): void;
  endAsync(): Promise<void>;
}

/** Opens an {@link MqttSubscriber}; injectable so tests can supply a fake. */
export type MqttConnector = (settings: MqttSettings) => Promise<MqttSubscriber>;

/** Default connector: opens a real `mqtt` connection from the shared {@link MqttSettings}. */
async function defaultConnector(settings: MqttSettings): Promise<MqttSubscriber> {
  const protocol = settings.use_tls ? 'mqtts' : 'mqtt';
  const options: IClientOptions = {
    port: settings.port,
    username: settings.username,
    password: settings.password
  };
  const client: MqttClient = await connectAsync(`${protocol}://${settings.host}`, options);
  return client as unknown as MqttSubscriber;
}

/** Configuration required by the {@link TasmotaAdapter}. */
export interface TasmotaConfig {
  /** The Tasmota device topic (its `%topic%`, e.g. `tasmota_plug`). */
  deviceTopic: string;
  /** Optional electricity rate per kWh; when set, a cost sensor is published. */
  costPerKwh?: number;
  /** Currency symbol for the cost sensor (only used when `costPerKwh` is set). */
  currency?: string;
}

/**
 * Bridges a Tasmota energy plug (or any Tasmota device with an `ENERGY` block) to MQTT / Home Assistant.
 *
 * Unlike the HTTP-poll adapters, Tasmota already publishes to MQTT, so this adapter **subscribes** to the device's
 * `tele/.../SENSOR` and `STATE` topics on the same broker, normalizes them, and republishes as Home Assistant discovery
 * entities: power + energy (+ optional cost) via the shared {@link PowerEnergyPublisher}, plus
 * voltage/current/power-factor sensors and a controllable on/off switch that issues `cmnd/.../POWER`.
 *
 * Telemetry sensors and the control switch are created **only when the bridge's {@link OutputPolicy} permits** them; in
 * energy-only mode the plug is reduced to power + energy (+ cost).
 */
export class TasmotaAdapter implements SourceAdapter {
  readonly id = 'tasmota';
  readonly displayName = 'Tasmota';

  private readonly topics: ReturnType<typeof tasmotaTopics>;

  private powerEnergy?: PowerEnergyPublisher;
  private voltage?: Sensor;
  private current?: Sensor;
  private powerFactor?: Sensor;
  private outputSwitch?: Switch;

  private device!: DeviceConfiguration;
  private origin!: OriginConfiguration;
  private identifier!: string;

  private readonly sensors: Sensor[] = [];
  private subscriber?: MqttSubscriber;

  /**
   * @param config - Tasmota device configuration.
   * @param mqttSettings - Shared MQTT connection settings (also used for the subscriber connection).
   * @param logger - Logger scoped to this adapter.
   * @param policy - The bridge output policy (the energy-only "safety switch").
   * @param connector - Opens the MQTT subscriber connection (injectable for testing).
   */
  constructor(
    private readonly config: TasmotaConfig,
    private readonly mqttSettings: MqttSettings,
    private readonly logger: pino.Logger,
    private readonly policy: OutputPolicy = OutputPolicy.unrestricted(),
    private readonly connector: MqttConnector = defaultConnector
  ) {
    this.topics = tasmotaTopics(this.config.deviceTopic);
  }

  /** Registers the permitted entities and subscribes to the device's Tasmota telemetry topics. */
  async start(): Promise<void> {
    this.identifier = `tasmota_${this.config.deviceTopic.replace(/[^a-zA-Z0-9]/g, '_')}`;
    this.device = {
      identifiers: this.identifier,
      name: `Tasmota ${this.config.deviceTopic}`,
      manufacturer: 'Tasmota'
    };
    this.origin = {
      name: 'mysa2mqtt',
      sw_version: version,
      support_url: 'https://github.com/bourquep/mysa2mqtt'
    };

    this.powerEnergy = new PowerEnergyPublisher({
      mqtt: this.mqttSettings,
      logger: new PinoLogger(this.logger.child({ module: 'tasmota', entity: 'power-energy' })),
      device: this.device,
      origin: this.origin,
      uniqueIdPrefix: this.identifier,
      costPerKwh: this.config.costPerKwh,
      currency: this.config.currency
    });
    await this.powerEnergy.writeConfig();

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
        suggested_display_precision: 3
      });
      this.powerFactor = this.makeSensor('power_factor', 'Power factor', {
        device_class: 'power_factor',
        state_class: 'measurement',
        suggested_display_precision: 2
      });
      for (const sensor of this.sensors) {
        await sensor.writeConfig();
      }
    }

    if (this.policy.allowsControl) {
      this.outputSwitch = new Switch(
        {
          mqtt: this.mqttSettings,
          logger: new PinoLogger(this.logger.child({ module: 'tasmota', entity: 'switch' })),
          component: {
            component: 'switch',
            device: this.device,
            origin: this.origin,
            unique_id: `${this.identifier}_switch`,
            name: 'Power',
            device_class: 'outlet'
          }
        },
        async (_topic, message) => {
          try {
            await this.subscriber?.publishAsync(this.topics.command, message === 'ON' ? 'ON' : 'OFF');
          } catch (error) {
            this.logger.error(error, 'Failed to send Tasmota power command');
          }
        }
      );
      await this.outputSwitch.writeConfig();
    } else {
      this.logger.info('Energy-only mode: Tasmota on/off control is disabled.');
    }

    // Tasmota pushes telemetry over MQTT, so subscribe to its topics on the same broker.
    this.subscriber = await this.connector(this.mqttSettings);
    this.subscriber.on('message', (topic, payload) => {
      this.handleMessage(topic, payload.toString()).catch((error) =>
        this.logger.error(error, 'Failed to handle Tasmota message')
      );
    });
    await this.subscriber.subscribeAsync([this.topics.sensor, this.topics.state, this.topics.result]);

    this.logger.info(`Subscribed to Tasmota device '${this.config.deviceTopic}'.`);
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
      logger: new PinoLogger(this.logger.child({ module: 'tasmota', entity: suffix })),
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
   * Handles an incoming Tasmota MQTT message: parses it and publishes the permitted entities.
   *
   * @param _topic - The source topic (unused; all subscribed topics carry the same shape).
   * @param payload - The raw payload string.
   */
  private async handleMessage(_topic: string, payload: string): Promise<void> {
    const reading = parseTasmotaPayload(payload);

    if (reading.powerWatts != null || reading.totalEnergyKwh != null) {
      await this.powerEnergy?.updatePowerAndEnergy(reading.powerWatts, reading.totalEnergyKwh);
    }
    await this.setNumeric(this.voltage, reading.voltage, 0);
    await this.setNumeric(this.current, reading.currentAmps, 3);
    await this.setNumeric(this.powerFactor, reading.powerFactor, 2);

    if (this.outputSwitch && reading.output != null) {
      await (reading.output ? this.outputSwitch.on() : this.outputSwitch.off());
    }
  }

  /**
   * Publishes a numeric sensor value when both the sensor and value exist.
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
    if (!sensor || value == null) {
      return;
    }
    await sensor.setState('state_topic', value.toFixed(fractionDigits));
  }

  /** Unsubscribes, closes the subscriber connection, and marks the entities unavailable. */
  async stop(): Promise<void> {
    try {
      await this.subscriber?.endAsync();
    } catch (error) {
      this.logger.warn(error, 'Failed to close Tasmota MQTT subscriber');
    }
    this.subscriber = undefined;

    await Promise.all([
      this.powerEnergy?.setUnavailable() ?? Promise.resolve(),
      this.outputSwitch?.setAvailability(false) ?? Promise.resolve(),
      ...this.sensors.map((sensor) => sensor.setAvailability(false))
    ]);
  }
}

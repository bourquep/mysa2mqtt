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
import os from 'node:os';
import pino from 'pino';
import { SourceAdapter } from '../../bridge/types';
import { PinoLogger } from '../../logger';
import { version } from '../../version';
import { collectSystemMetrics } from './metrics';

/** Default interval, in milliseconds, between system metric publishes. */
const DEFAULT_REFRESH_INTERVAL_MS = 60_000;

/**
 * A reference {@link SourceAdapter} that publishes host system metrics (uptime, load average, memory) as Home Assistant
 * sensors.
 *
 * It exists both as a genuinely useful, dependency-free monitor and as a worked example of how to add a new,
 * non-thermostat source to the bridge — it uses only Node's built-in `os` module and the same `mqtt2ha` primitives as
 * the Mysa adapter.
 */
export class SystemAdapter implements SourceAdapter {
  readonly id = 'system';
  readonly displayName = 'System metrics';

  private readonly sensors: Sensor[] = [];
  private uptimeSensor?: Sensor;
  private loadSensor?: Sensor;
  private memoryUsedSensor?: Sensor;
  private memoryFreeSensor?: Sensor;
  private timer?: NodeJS.Timeout;

  /**
   * @param mqttSettings - Shared MQTT connection settings.
   * @param logger - Logger scoped to this adapter.
   * @param refreshIntervalMs - How often to publish metrics, in milliseconds.
   */
  constructor(
    private readonly mqttSettings: MqttSettings,
    private readonly logger: pino.Logger,
    private readonly refreshIntervalMs: number = DEFAULT_REFRESH_INTERVAL_MS
  ) {}

  /** Registers the Home Assistant sensors, publishes an initial reading, and starts the refresh timer. */
  async start(): Promise<void> {
    const hostname = os.hostname();

    const device: DeviceConfiguration = {
      identifiers: `mysa2mqtt_host_${hostname}`,
      name: `mysa2mqtt host (${hostname})`,
      manufacturer: 'mysa2mqtt',
      model: 'Host system'
    };

    const origin: OriginConfiguration = {
      name: 'mysa2mqtt',
      sw_version: version,
      support_url: 'https://github.com/bourquep/mysa2mqtt'
    };

    const makeSensor = (suffix: string, name: string, extra: Record<string, unknown>): Sensor =>
      new Sensor({
        mqtt: this.mqttSettings,
        logger: new PinoLogger(this.logger.child({ module: 'system', sensor: suffix })),
        component: {
          component: 'sensor',
          device,
          origin,
          unique_id: `mysa2mqtt_host_${hostname}_${suffix}`,
          name,
          entity_category: 'diagnostic',
          force_update: true,
          ...extra
        }
      });

    this.uptimeSensor = makeSensor('uptime', 'Uptime', {
      device_class: 'duration',
      unit_of_measurement: 's',
      state_class: 'measurement',
      suggested_display_precision: 0
    });
    this.loadSensor = makeSensor('load_1m', 'Load average (1m)', {
      state_class: 'measurement',
      suggested_display_precision: 2,
      icon: 'mdi:gauge'
    });
    this.memoryUsedSensor = makeSensor('memory_used', 'Memory used', {
      unit_of_measurement: '%',
      state_class: 'measurement',
      suggested_display_precision: 1,
      icon: 'mdi:memory'
    });
    this.memoryFreeSensor = makeSensor('memory_free', 'Memory free', {
      device_class: 'data_size',
      unit_of_measurement: 'B',
      state_class: 'measurement',
      suggested_display_precision: 0
    });

    this.sensors.push(this.uptimeSensor, this.loadSensor, this.memoryUsedSensor, this.memoryFreeSensor);

    for (const sensor of this.sensors) {
      await sensor.writeConfig();
    }

    await this.publish();

    this.timer = setInterval(() => {
      this.publish().catch((error) => this.logger.error(error, 'Failed to publish system metrics'));
    }, this.refreshIntervalMs);
    // Don't let the refresh timer keep the process alive on its own.
    this.timer.unref();

    this.logger.info(`Publishing host system metrics every ${Math.round(this.refreshIntervalMs / 1000)}s.`);
  }

  /** Publishes a fresh snapshot of the system metrics to MQTT. */
  private async publish(): Promise<void> {
    const metrics = collectSystemMetrics();
    await this.uptimeSensor?.setState('state_topic', metrics.uptimeSeconds.toString());
    await this.loadSensor?.setState('state_topic', metrics.loadAverage1m.toFixed(2));
    await this.memoryUsedSensor?.setState('state_topic', metrics.memoryUsedPercent.toFixed(1));
    await this.memoryFreeSensor?.setState('state_topic', metrics.memoryFreeBytes.toString());
  }

  /** Stops the refresh timer and marks the sensors unavailable. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    await Promise.all(this.sensors.map((sensor) => sensor.setAvailability(false)));
  }
}

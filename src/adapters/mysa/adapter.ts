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
import { DeviceBase, MysaApiClient } from 'mysa-js-sdk';
import pino from 'pino';
import { SourceAdapter } from '../../bridge/types';
import { PinoLogger } from '../../logger';
import { version } from '../../version';
import { extractEnergyKwh, fetchMysaDeviceEnergy } from './energy-api';
import { loadSession, saveSession } from './session';
import { Thermostat } from './thermostat';

/** How often to poll the experimental Mysa cloud energy API, in milliseconds. */
const ENERGY_POLL_INTERVAL_MS = 5 * 60_000;

/** Configuration required by the {@link MysaAdapter}. */
export interface MysaAdapterConfig {
  /** Mysa account username/email. */
  username: string;
  /** Mysa account password. */
  password: string;
  /** Path to the file used to persist the Mysa session. */
  sessionFile: string;
  /** Temperature unit Home Assistant is configured with. */
  temperatureUnit: 'C' | 'F';
  /** Estimated current (A) for devices that don't report power (e.g. Lite models); enables power/energy for them. */
  estimatedCurrent?: number;
  /** Whether to poll the experimental Mysa cloud energy API. */
  energyApiEnabled?: boolean;
}

/**
 * Bridges Mysa smart thermostats to MQTT / Home Assistant.
 *
 * This adapter encapsulates everything Mysa-specific: authenticating against the Mysa cloud, discovering devices, and
 * creating a {@link Thermostat} per device. The generic bridge core ({@link BridgeManager}) only sees the
 * {@link SourceAdapter} contract.
 */
export class MysaAdapter implements SourceAdapter {
  readonly id = 'mysa';
  readonly displayName = 'Mysa';

  private readonly thermostats: Thermostat[] = [];
  private readonly devices: DeviceBase[] = [];
  private client?: MysaApiClient;

  /** Lazily-created "cloud energy" sensors (experimental), keyed by device id. */
  private readonly cloudEnergySensors = new Map<string, Sensor>();
  private energyTimer?: NodeJS.Timeout;

  /**
   * @param config - Mysa account and session configuration.
   * @param mqttSettings - Shared MQTT connection settings.
   * @param logger - Logger scoped to this adapter.
   */
  constructor(
    private readonly config: MysaAdapterConfig,
    private readonly mqttSettings: MqttSettings,
    private readonly logger: pino.Logger
  ) {}

  /** Authenticates with Mysa, discovers thermostats, and starts bridging each of them. */
  async start(): Promise<void> {
    const session = await loadSession(this.config.sessionFile, this.logger);
    const client = new MysaApiClient(session, {
      logger: new PinoLogger(this.logger.child({ module: 'mysa-js-sdk' }))
    });
    this.client = client;

    client.emitter.on('sessionChanged', async (newSession) => {
      await saveSession(newSession, this.config.sessionFile, this.logger);
    });

    if (!client.isAuthenticated) {
      this.logger.info('Logging in...');
      await client.login(this.config.username, this.config.password);
    }

    this.logger.debug('Fetching devices and firmwares...');
    const [devices, firmwares] = await Promise.all([client.getDevices(), client.getDeviceFirmwares()]);

    this.logger.debug('Fetching serial numbers...');
    const serialNumbers = new Map<string, string>();
    for (const [deviceId] of Object.entries(devices.DevicesObj)) {
      try {
        const serial = await client.getDeviceSerialNumber(deviceId);
        if (serial) {
          serialNumbers.set(deviceId, serial);
        }
      } catch (error) {
        this.logger.error(error, `Failed to retrieve serial number for device ${deviceId}`);
      }
    }

    this.logger.debug('Initializing MQTT entities...');
    for (const [, device] of Object.entries(devices.DevicesObj)) {
      this.devices.push(device);
      this.thermostats.push(
        new Thermostat(
          client,
          device,
          this.mqttSettings,
          new PinoLogger(this.logger.child({ module: 'thermostat', deviceId: device.Id })),
          firmwares.Firmware[device.Id],
          serialNumbers.get(device.Id),
          this.config.temperatureUnit,
          this.config.estimatedCurrent
        )
      );
    }

    for (const thermostat of this.thermostats) {
      await thermostat.start();
    }

    this.logger.info(`Bridging ${this.thermostats.length} thermostat(s).`);

    if (this.config.energyApiEnabled) {
      this.startEnergyPolling();
    }
  }

  /** Stops every bridged thermostat (and the energy poller), marking the Home Assistant entities unavailable. */
  async stop(): Promise<void> {
    if (this.energyTimer) {
      clearInterval(this.energyTimer);
      this.energyTimer = undefined;
    }

    await Promise.all([
      ...this.thermostats.map((thermostat) => thermostat.stop()),
      ...Array.from(this.cloudEnergySensors.values()).map((sensor) => sensor.setAvailability(false))
    ]);
  }

  /**
   * Starts polling the experimental Mysa cloud energy API.
   *
   * This is best-effort and fail-soft: each poll logs the raw response (so the schema can be confirmed against a real
   * account) and only publishes a sensor when an unambiguous energy total is found. Failures are logged and ignored.
   */
  private startEnergyPolling(): void {
    this.logger.warn(
      'Mysa cloud energy API is experimental and unverified. The raw response is logged at debug level; please share it so the sensor can be wired precisely.'
    );

    const poll = async () => {
      for (const device of this.devices) {
        await this.pollDeviceEnergy(device);
      }
    };

    void poll();
    this.energyTimer = setInterval(() => void poll(), ENERGY_POLL_INTERVAL_MS);
    this.energyTimer.unref();
  }

  /**
   * Polls and publishes the experimental cloud energy total for a single device.
   *
   * @param device - The device to poll.
   */
  private async pollDeviceEnergy(device: DeviceBase): Promise<void> {
    const idToken = this.client?.session?.idToken;
    if (!idToken) {
      this.logger.debug(`No Mysa session token available; skipping cloud energy poll for ${device.Id}`);
      return;
    }

    try {
      const payload = await fetchMysaDeviceEnergy(device.Id, idToken);
      this.logger.debug({ deviceId: device.Id, payload }, 'Mysa cloud energy response');

      const kwh = extractEnergyKwh(payload);
      if (kwh == null) {
        this.logger.debug(
          `Could not extract an energy total for ${device.Id}; inspect the debug response to map the schema`
        );
        return;
      }

      const sensor = await this.cloudEnergySensorFor(device);
      await sensor.setState('state_topic', kwh.toFixed(3));
    } catch (error) {
      this.logger.warn(
        `Mysa cloud energy poll failed for ${device.Id}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  /**
   * Returns the (lazily created) experimental cloud-energy sensor for a device, attached to its Home Assistant device.
   *
   * @param device - The device to create the sensor for.
   * @returns The sensor instance.
   */
  private async cloudEnergySensorFor(device: DeviceBase): Promise<Sensor> {
    const existing = this.cloudEnergySensors.get(device.Id);
    if (existing) {
      return existing;
    }

    const mqttDevice: DeviceConfiguration = { identifiers: device.Id, name: device.Name, manufacturer: 'Mysa' };
    const origin: OriginConfiguration = {
      name: 'mysa2mqtt',
      sw_version: version,
      support_url: 'https://github.com/bourquep/mysa2mqtt'
    };

    const sensor = new Sensor({
      mqtt: this.mqttSettings,
      logger: new PinoLogger(this.logger.child({ module: 'mysa-energy', deviceId: device.Id })),
      component: {
        component: 'sensor',
        device: mqttDevice,
        origin,
        unique_id: `mysa_${device.Id}_cloud_energy`,
        name: 'Energy (Mysa cloud, experimental)',
        device_class: 'energy',
        state_class: 'total_increasing',
        unit_of_measurement: 'kWh',
        suggested_display_precision: 3
      }
    });

    await sensor.writeConfig();
    this.cloudEnergySensors.set(device.Id, sensor);
    return sensor;
  }
}

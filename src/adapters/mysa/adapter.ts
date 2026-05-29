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

import { MqttSettings } from 'mqtt2ha';
import { MysaApiClient } from 'mysa-js-sdk';
import pino from 'pino';
import { SourceAdapter } from '../../bridge/types';
import { PinoLogger } from '../../logger';
import { loadSession, saveSession } from './session';
import { Thermostat } from './thermostat';

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
      this.thermostats.push(
        new Thermostat(
          client,
          device,
          this.mqttSettings,
          new PinoLogger(this.logger.child({ module: 'thermostat', deviceId: device.Id })),
          firmwares.Firmware[device.Id],
          serialNumbers.get(device.Id),
          this.config.temperatureUnit
        )
      );
    }

    for (const thermostat of this.thermostats) {
      await thermostat.start();
    }

    this.logger.info(`Bridging ${this.thermostats.length} thermostat(s).`);
  }

  /** Stops every bridged thermostat, marking their Home Assistant entities unavailable. */
  async stop(): Promise<void> {
    await Promise.all(this.thermostats.map((thermostat) => thermostat.stop()));
  }
}

#!/usr/bin/env node

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

import { writeFile } from 'fs/promises';
import { MqttSettings } from 'mqtt2ha';
import { DeviceBase, MysaApiClient } from 'mysa-js-sdk';
import { pino } from 'pino';
import { PinoLogger } from './logger';
import { options } from './options';
import { Thermostat } from './thermostat';

const START_RETRY_INITIAL_DELAY_MS = 30_000;
const START_RETRY_MAX_DELAY_MS = 300_000;
const START_RETRY_MAX_EXPONENT = Math.ceil(Math.log2(START_RETRY_MAX_DELAY_MS / START_RETRY_INITIAL_DELAY_MS));

const rootLogger = pino({
  name: 'mysa2mqtt',
  level: options.logLevel,
  transport:
    options.logFormat === 'pretty'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: true,
            ignore: 'hostname,module',
            messageFormat: '\x1b[33m[{module}]\x1b[39m {msg}'
          }
        }
      : undefined
});

/** Mysa2mqtt entry-point. */
async function main() {
  rootLogger.info('Starting mysa2mqtt...');

  const client = new MysaApiClient(
    { username: options.mysaUsername, password: options.mysaPassword },
    { logger: new PinoLogger(rootLogger.child({ module: 'mysa-js-sdk' })) }
  );

  const heartbeatFile = options.heartbeatFile;
  if (heartbeatFile) {
    // Data-freshness heartbeat: an orchestrator liveness probe can compare
    // this file's mtime against the expected message cadence (devices report
    // at least every ~5 minutes while keep-alives flow) and restart the
    // process when the Mysa cloud connection wedges without emitting errors.
    let lastBeat = 0;
    client.emitter.on('rawRealtimeMessageReceived', () => {
      const now = Date.now();
      if (now - lastBeat < 10_000) {
        return;
      }
      lastBeat = now;
      writeFile(heartbeatFile, `${new Date(now).toISOString()}\n`).catch((error) => {
        rootLogger.warn(error, `Failed to write heartbeat file '${heartbeatFile}'`);
      });
    });
  }

  rootLogger.info('Logging in...');
  await client.login();

  rootLogger.debug('Fetching devices and firmwares...');
  const [devices, firmwares] = await Promise.all([client.getDevices(), client.getDeviceFirmwares()]);

  rootLogger.debug('Fetching serial numbers...');
  const serialNumbers = new Map<string, string>();
  for (const [deviceId] of Object.entries(devices.DevicesObj)) {
    try {
      const serial = await client.getDeviceSerialNumber(deviceId);
      if (serial) {
        serialNumbers.set(deviceId, serial);
      }
    } catch (error) {
      rootLogger.error(error, `Failed to retrieve serial number for device ${deviceId}`);
    }
  }

  rootLogger.debug('Initializing MQTT entities...');

  const mqttSettings: MqttSettings = {
    host: options.mqttHost,
    port: options.mqttPort,
    username: options.mqttUsername,
    password: options.mqttPassword,
    client_name: options.mqttClientName,
    state_prefix: options.mqttTopicPrefix
  };

  const heaterWatts: Map<string, number> = options.heaterWatts ?? new Map();
  const matchedHeaterWattsKeys = new Set<string>();

  /**
   * Resolves the configured heater wattage for a device, by id or by name.
   *
   * @param device - The Mysa device to resolve the wattage for.
   * @returns The configured wattage, or undefined when the device was not configured.
   */
  function resolveHeaterWatts(device: DeviceBase): number | undefined {
    for (const key of [device.Id, device.Name]) {
      const normalizedKey = key?.toLowerCase();
      if (normalizedKey == null) {
        continue;
      }

      const watts = heaterWatts.get(normalizedKey);
      if (watts != null) {
        matchedHeaterWattsKeys.add(normalizedKey);
        return watts;
      }
    }

    return undefined;
  }

  const thermostats = Object.entries(devices.DevicesObj).map(
    ([, device]) =>
      new Thermostat(
        client,
        device,
        mqttSettings,
        new PinoLogger(rootLogger.child({ module: 'thermostat', deviceId: device.Id })),
        firmwares.Firmware[device.Id],
        serialNumbers.get(device.Id),
        options.temperatureUnit,
        resolveHeaterWatts(device)
      )
  );

  heaterWatts.forEach((_watts, key) => {
    if (!matchedHeaterWattsKeys.has(key)) {
      rootLogger.warn(`Heater wattage was configured for '${key}', which matches no device id or name.`);
    }
  });

  let startedThermostatCount = 0;
  const failedThermostats: Thermostat[] = [];
  for (const thermostat of thermostats) {
    if (await tryStartThermostat(thermostat)) {
      startedThermostatCount += 1;
    } else {
      failedThermostats.push(thermostat);
    }
  }

  if (thermostats.length > 0 && startedThermostatCount === 0) {
    throw new Error('Failed to start any thermostats');
  }

  for (const thermostat of failedThermostats) {
    scheduleThermostatStartRetry(thermostat);
  }
}

/**
 * Starts a thermostat and captures failures for startup summary logic.
 *
 * @param thermostat - Thermostat to start.
 * @returns True when the thermostat started successfully.
 */
async function tryStartThermostat(thermostat: Thermostat): Promise<boolean> {
  try {
    await thermostat.start();
    return true;
  } catch (error) {
    rootLogger.error(error, `Failed to start thermostat ${thermostat.mysaDevice.Id}`);
    return false;
  }
}

/**
 * Schedules a retry for a thermostat that failed during startup.
 *
 * @param thermostat - Thermostat to retry.
 * @param retryAttempt - Current retry attempt.
 */
function scheduleThermostatStartRetry(thermostat: Thermostat, retryAttempt = 0): void {
  const retryExponent = Math.min(retryAttempt, START_RETRY_MAX_EXPONENT);
  const delayMs = Math.min(START_RETRY_MAX_DELAY_MS, START_RETRY_INITIAL_DELAY_MS * 2 ** retryExponent);

  rootLogger.info(`Retrying thermostat ${thermostat.mysaDevice.Id} startup in ${delayMs}ms`);

  setTimeout(() => {
    void retryThermostatStart(thermostat, retryAttempt + 1);
  }, delayMs);
}

/**
 * Retries a failed thermostat startup until it succeeds.
 *
 * @param thermostat - Thermostat to retry.
 * @param retryAttempt - Current retry attempt.
 */
async function retryThermostatStart(thermostat: Thermostat, retryAttempt: number): Promise<void> {
  try {
    await thermostat.start();
    rootLogger.info(`Started thermostat ${thermostat.mysaDevice.Id} after retry`);
  } catch (error) {
    rootLogger.error(error, `Failed to start thermostat ${thermostat.mysaDevice.Id}`);
    scheduleThermostatStartRetry(thermostat, retryAttempt);
  }
}

main().catch((error) => {
  rootLogger.fatal(error, 'Unexpected error');
  process.exit(1);
});

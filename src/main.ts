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

import { MqttSettings } from 'mqtt2ha';
import { MysaApiClient } from 'mysa-js-sdk';
import { pino } from 'pino';
import { PinoLogger } from './logger';
import { options } from './options';
import { loadSession, saveSession } from './session';
import { Thermostat } from './thermostat';

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

/** All thermostats currently bridged by this process, tracked so they can be stopped on shutdown. */
const thermostats: Thermostat[] = [];

/** Guards against running the shutdown sequence more than once. */
let isShuttingDown = false;

/** How long to wait for a graceful shutdown before forcing the process to exit. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Gracefully shuts down the bridge in response to a termination signal.
 *
 * Stops every thermostat (which marks its Home Assistant entities unavailable) and then exits. A safety timer forces
 * the process to exit if a thermostat fails to stop in time, so a hung broker connection can never wedge the
 * container.
 *
 * @param signal - The signal that triggered the shutdown.
 */
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  rootLogger.info(`Received ${signal}, shutting down...`);

  const forceExit = setTimeout(() => {
    rootLogger.warn('Graceful shutdown timed out; forcing exit.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  // Don't let the safety timer keep the event loop alive on its own.
  forceExit.unref();

  const results = await Promise.allSettled(thermostats.map((thermostat) => thermostat.stop()));
  for (const result of results) {
    if (result.status === 'rejected') {
      rootLogger.error(result.reason, 'Error while stopping thermostat during shutdown');
    }
  }

  clearTimeout(forceExit);
  rootLogger.info('Shutdown complete.');
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

/** Mysa2mqtt entry-point. */
async function main() {
  rootLogger.info('Starting mysa2mqtt...');

  const session = await loadSession(options.mysaSessionFile, rootLogger);
  const client = new MysaApiClient(session, { logger: new PinoLogger(rootLogger.child({ module: 'mysa-js-sdk' })) });

  client.emitter.on('sessionChanged', async (newSession) => {
    await saveSession(newSession, options.mysaSessionFile, rootLogger);
  });

  if (!client.isAuthenticated) {
    rootLogger.info('Logging in...');
    await client.login(options.mysaUsername, options.mysaPassword);
  }

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

  for (const [, device] of Object.entries(devices.DevicesObj)) {
    thermostats.push(
      new Thermostat(
        client,
        device,
        mqttSettings,
        new PinoLogger(rootLogger.child({ module: 'thermostat', deviceId: device.Id })),
        firmwares.Firmware[device.Id],
        serialNumbers.get(device.Id),
        options.temperatureUnit
      )
    );
  }

  for (const thermostat of thermostats) {
    await thermostat.start();
  }

  rootLogger.info(`Bridging ${thermostats.length} thermostat(s). Press Ctrl+C to stop.`);
}

main().catch((error) => {
  rootLogger.fatal(error, 'Unexpected error');
  process.exit(1);
});

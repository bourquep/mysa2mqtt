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
      rootLogger.error(`Failed to retrieve serial number for device ${deviceId}`, error);
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

  const thermostats = Object.entries(devices.DevicesObj).map(
    ([, device]) =>
      new Thermostat(
        client,
        device,
        mqttSettings,
        new PinoLogger(rootLogger.child({ module: 'thermostat', deviceId: device.Id })),
        firmwares.Firmware[device.Id],
        serialNumbers.get(device.Id)
      )
  );

  for (const thermostat of thermostats) {
    await thermostat.start();
  }
}

main().catch((error) => {
  rootLogger.fatal(error, 'Unexpected error');
  process.exit(1);
});

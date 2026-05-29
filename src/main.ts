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
import { pino } from 'pino';
import { MysaAdapter } from './adapters/mysa/adapter';
import { SystemAdapter } from './adapters/system/adapter';
import { BridgeManager } from './bridge/manager';
import { SourceAdapter } from './bridge/types';
import { options } from './options';

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

/** The running bridge, tracked so it can be stopped on shutdown. */
let bridge: BridgeManager | undefined;

/** Guards against running the shutdown sequence more than once. */
let isShuttingDown = false;

/** How long to wait for a graceful shutdown before forcing the process to exit. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Gracefully shuts down the bridge in response to a termination signal.
 *
 * Stops every adapter (which marks its Home Assistant entities unavailable) and then exits. A safety timer forces the
 * process to exit if an adapter fails to stop in time, so a hung connection can never wedge the container.
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

  try {
    await bridge?.stop();
  } catch (error) {
    rootLogger.error(error, 'Error during shutdown');
  }

  clearTimeout(forceExit);
  rootLogger.info('Shutdown complete.');
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

/**
 * Builds the set of enabled source adapters from the current configuration.
 *
 * @param mqttSettings - Shared MQTT connection settings passed to every adapter.
 * @returns The adapters to run.
 */
function buildAdapters(mqttSettings: MqttSettings): SourceAdapter[] {
  const adapters: SourceAdapter[] = [
    new MysaAdapter(
      {
        username: options.mysaUsername,
        password: options.mysaPassword,
        sessionFile: options.mysaSessionFile,
        temperatureUnit: options.temperatureUnit,
        estimatedCurrent: options.mysaEstimatedCurrent,
        energyApiEnabled: options.mysaEnergyApi === 'true',
        diagnostics: options.mysaDiagnostics === 'true',
        diagnosticsFile: options.mysaDiagnosticsFile
      },
      mqttSettings,
      rootLogger.child({ module: 'mysa' })
    )
  ];

  if (options.systemSensors === 'true') {
    adapters.push(new SystemAdapter(mqttSettings, rootLogger.child({ module: 'system' })));
  }

  return adapters;
}

/** Mysa2mqtt entry-point. */
async function main() {
  rootLogger.info('Starting mysa2mqtt...');

  const mqttSettings: MqttSettings = {
    host: options.mqttHost,
    port: options.mqttPort,
    username: options.mqttUsername,
    password: options.mqttPassword,
    client_name: options.mqttClientName,
    state_prefix: options.mqttTopicPrefix
  };

  bridge = new BridgeManager(buildAdapters(mqttSettings), rootLogger);
  await bridge.start();

  rootLogger.info('mysa2mqtt is running. Press Ctrl+C to stop.');
}

main().catch((error) => {
  rootLogger.fatal(error, 'Unexpected error');
  process.exit(1);
});

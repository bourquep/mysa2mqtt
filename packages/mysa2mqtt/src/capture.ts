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

/*
 * ---------------------------------------------------------------------------
 * Shadow-protocol capture tool (debugging / reverse-engineering aid)
 * ---------------------------------------------------------------------------
 *
 * mysa2mqtt speaks the custom `/v1/dev/{id}/out`+`/in` protocol used by the
 * baseboard and AC thermostats. The central-HVAC ST-V1 thermostats instead use
 * AWS IoT Device Shadows (`$aws/things/{id}/shadow/...`), which the SDK does not
 * model yet. This standalone command logs in with a Mysa account, dumps the REST
 * metadata for the target device(s), then passively subscribes to their shadow
 * topics and records every raw message. Drive the thermostat from the Mysa app
 * while it runs and the capture shows exactly what the device reports and what
 * the app sends — the raw material needed to implement support for the device.
 *
 * It is intentionally separate from the main bridge (`mysa2mqtt`): it needs no
 * MQTT broker and only reads from Mysa.
 */

import { Command, Option } from 'commander';
import { configDotenv } from 'dotenv';
import { createWriteStream, WriteStream } from 'fs';
import { DeviceBase, MysaApiClient, UnauthenticatedError } from 'mysa-js-sdk';
import { pino } from 'pino';
import { PinoLogger } from './logger';

configDotenv({ path: ['.env', '.env.local'], override: true });

const options = new Command('mysa2mqtt-capture')
  .description(
    'Capture the raw AWS IoT Device Shadow traffic of Mysa central-HVAC (ST-V1) thermostats, to help implement ' +
      'support for them. Logs in to Mysa, dumps the device metadata, then records every shadow message until you ' +
      'press Ctrl+C. Drive the thermostat from the Mysa app while it runs.'
  )
  .addOption(
    new Option('-u, --mysa-username <mysaUsername>', 'Mysa account username (email)')
      .env('M2M_MYSA_USERNAME')
      .makeOptionMandatory()
  )
  .addOption(
    new Option('-p, --mysa-password <mysaPassword>', 'Mysa account password').env('M2M_MYSA_PASSWORD').makeOptionMandatory()
  )
  .addOption(
    new Option(
      '-d, --device <deviceIdOrName...>',
      'limit capture to these device id(s) or name(s). Repeatable. Defaults to every central-HVAC (ST-*) device'
    )
  )
  .addOption(new Option('--all-devices', 'capture from every device on the account, not just central-HVAC ones'))
  .addOption(
    new Option(
      '-e, --extra-topic <topicFilter...>',
      'additional raw MQTT topic filter(s) to subscribe to, on top of the per-device shadow topics. Repeatable'
    )
  )
  .addOption(
    new Option('-o, --output <file>', 'also write the metadata dump and every captured message to this file')
  )
  .addOption(
    new Option('--duration <seconds>', 'stop automatically after this many seconds (default: run until Ctrl+C)')
      .argParser((v) => parseInt(v, 10))
      .default(0)
  )
  .addOption(
    new Option('-l, --log-level <logLevel>', 'log level')
      .choices(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .env('M2M_LOG_LEVEL')
      .default('info')
  )
  .parse()
  .opts();

const logger = pino({
  name: 'mysa2mqtt-capture',
  level: options.logLevel,
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, singleLine: true, ignore: 'hostname,module,pid' }
  }
});

/** Optional file sink for the metadata dump and captured messages. */
let outputStream: WriteStream | undefined;

/**
 * Writes a block to the console and, when `--output` was given, to the capture file. Used for the material the OP
 * ultimately sends back (metadata + raw messages), kept separate from the pino status log.
 *
 * @param text - The text to emit.
 */
function emit(text: string): void {
  process.stdout.write(text + '\n');
  outputStream?.write(text + '\n');
}

/**
 * Logs in, turning a credential rejection into an actionable message.
 *
 * @param client - The client to log in.
 */
async function login(client: MysaApiClient): Promise<void> {
  try {
    await client.login();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      throw new Error(
        'Mysa rejected the credentials. Verify that the same username and password let you sign in to the Mysa ' +
          'mobile app, and beware of a shell or .env file mangling special characters ($, `) in the password.',
        { cause: error }
      );
    }
    throw error;
  }
}

/**
 * Selects which devices to capture from, based on the CLI options.
 *
 * @param devices - Every device on the account, indexed by id.
 * @returns The device ids to capture from.
 */
function selectDevices(devices: Record<string, DeviceBase>): string[] {
  const entries = Object.entries(devices);

  if (options.device && options.device.length > 0) {
    const wanted = options.device.map((d: string) => d.toLowerCase());
    const matched = entries.filter(
      ([id, dev]) => wanted.includes(id.toLowerCase()) || (dev.Name !== undefined && wanted.includes(dev.Name.toLowerCase()))
    );
    return matched.map(([id]) => id);
  }

  if (options.allDevices) {
    return entries.map(([id]) => id);
  }

  // Default: central-HVAC thermostats. Their model ids start with `ST-` (e.g. ST-V1-0).
  return entries.filter(([, dev]) => dev.Model?.toUpperCase().startsWith('ST-')).map(([id]) => id);
}

/** Main entry-point. */
async function main() {
  if (options.output) {
    outputStream = createWriteStream(options.output, { flags: 'w' });
    logger.info(`Writing metadata and captured messages to '${options.output}'`);
  }

  const client = new MysaApiClient(
    { username: options.mysaUsername, password: options.mysaPassword },
    { logger: new PinoLogger(logger.child({ module: 'mysa-js-sdk' })) }
  );

  logger.info('Logging in to Mysa...');
  await login(client);

  logger.info('Fetching devices, firmwares and states...');
  const [devices, firmwares, states] = await Promise.all([
    client.getDevices(),
    client.getDeviceFirmwares(),
    client.getDeviceStates()
  ]);

  const targetIds = selectDevices(devices.DevicesObj);

  if (targetIds.length === 0) {
    logger.error(
      'No matching devices found. If your central-HVAC thermostat did not match the ST-* filter, re-run with ' +
        '`--all-devices` to list every device, or target it explicitly with `--device <id-or-name>`.'
    );
    // Still dump every device so the correct id/model is visible.
    emit('=== ALL DEVICES (no target matched) ===');
    emit(JSON.stringify(devices.DevicesObj, null, 2));
    outputStream?.end();
    return;
  }

  emit('==================================================================');
  emit('  Mysa central-HVAC capture');
  emit(`  Generated: ${new Date().toISOString()}`);
  emit('  NOTE: this dump may contain account identifiers (Owner, Home,');
  emit('  AllowedUsers, Zone). Review before sharing publicly. Auth tokens');
  emit('  and passwords are NEVER included.');
  emit('==================================================================');

  const topicFilters: string[] = [];

  for (const id of targetIds) {
    const device = devices.DevicesObj[id];
    const firmware = firmwares.Firmware?.[id];
    const state = states.DeviceStatesObj?.[id];

    emit('');
    emit(`------------------------------------------------------------------`);
    emit(`DEVICE ${device.Name ?? '(unnamed)'} — model ${device.Model} — id ${id}`);
    emit(`Firmware: ${firmware?.InstalledVersion ?? 'unknown'}`);
    emit(`------------------------------------------------------------------`);
    emit('--- device metadata (REST /devices) ---');
    emit(JSON.stringify(device, null, 2));
    emit('--- device state (REST /states) ---');
    emit(JSON.stringify(state ?? null, null, 2));

    // The device id doubles as the AWS IoT thing name (see MysaApiClient.getDeviceSerialNumber, which
    // calls DescribeThing with the device id), so its shadows live under $aws/things/{id}/shadow/...
    topicFilters.push(`$aws/things/${id}/shadow/#`);
    // Legacy custom protocol, in case the device also emits there.
    topicFilters.push(`/v1/dev/${id}/#`);
  }

  if (options.extraTopic) {
    topicFilters.push(...options.extraTopic);
  }

  emit('');
  emit('=== SUBSCRIBING TO TOPIC FILTERS ===');
  for (const filter of topicFilters) {
    emit(`  ${filter}`);
  }

  let messageCount = 0;
  const seenTopics = new Set<string>();

  await client.startRawTopicCapture(topicFilters, (topic, payload) => {
    messageCount++;
    seenTopics.add(topic);
    emit('');
    emit(`<<< [${new Date().toISOString()}] ${topic}`);
    emit(payload);
  });

  emit('');
  emit('==================================================================');
  emit('  Capture is running. Now, in the Mysa mobile app, exercise the');
  emit('  thermostat so every interaction is recorded:');
  emit('    1. Turn the system OFF, then back ON.');
  emit('    2. Switch modes: Heat, Cool, Auto, Fan-only (whatever it has).');
  emit('    3. Change the heat setpoint, then the cool setpoint.');
  emit('    4. In Auto, change both setpoints (and the deadband if shown).');
  emit('    5. Change the fan mode (Auto / On / Circulate).');
  emit('    6. Leave it idle a few minutes to catch periodic telemetry.');
  emit('  Pause a few seconds between actions. Press Ctrl+C when done.');
  emit('==================================================================');

  const stop = (reason: string) => {
    logger.info(`Stopping capture (${reason}). Captured ${messageCount} message(s) across ${seenTopics.size} topic(s).`);
    if (seenTopics.size === 0) {
      logger.warn(
        'No shadow messages were captured. Either the thermostat was not touched during the capture, or the ' +
          "account's AWS IoT policy does not allow subscribing to its shadow topics (check the log above for " +
          'subscribe failures). Re-run with `--log-level debug` to see the per-filter subscribe results.'
      );
    }
    emit('');
    emit(`=== END OF CAPTURE — ${messageCount} message(s), ${seenTopics.size} distinct topic(s) ===`);
    if (outputStream) {
      outputStream.end(() => process.exit(0));
    } else {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => stop('Ctrl+C'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  if (options.duration && options.duration > 0) {
    logger.info(`Will stop automatically after ${options.duration}s.`);
    setTimeout(() => stop(`--duration ${options.duration}s elapsed`), options.duration * 1000);
  }
}

main().catch((error) => {
  logger.error(error, 'Capture failed');
  outputStream?.end();
  process.exit(1);
});

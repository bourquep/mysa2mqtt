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

import { Command, InvalidArgumentError, Option } from 'commander';
import { configDotenv } from 'dotenv';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

configDotenv({
  path: ['.env', '.env.local'],
  override: true
});

/**
 * Gets the package version at runtime.
 *
 * @returns The package version or 'unknown' if it cannot be read.
 */
function getPackageVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packageJsonPath = join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Parses a required integer value.
 *
 * @param value - The value to parse.
 * @returns The parsed integer value.
 */
function parseRequiredInt(value: string) {
  const parsedValue = parseInt(value, 10);
  if (isNaN(parsedValue)) {
    throw new InvalidArgumentError('Must be a number.');
  }
  return parsedValue;
}

/**
 * Parses the REST poll interval, in seconds.
 *
 * A value of `0` disables polling. Any other value must be at least 30 seconds: the poll hits the account-wide state
 * endpoint once per interval for the whole fleet, and a tighter cadence would hammer Mysa for no practical benefit.
 *
 * @param value - The value to parse.
 * @returns The parsed interval in seconds.
 */
function parsePollInterval(value: string): number {
  const parsedValue = parseRequiredInt(value);
  // parseInt tolerates decimals and trailing characters ('0.5' and '0foo' both yield 0), which would
  // silently disable polling. Require the input to be exactly an integer before the range check.
  if (String(parsedValue) !== value.trim()) {
    throw new InvalidArgumentError('Must be a whole number of seconds.');
  }
  if (parsedValue !== 0 && parsedValue < 30) {
    throw new InvalidArgumentError('Must be 0 (disabled) or at least 30 seconds.');
  }
  return parsedValue;
}

/**
 * Parses a comma-separated list of `<device>=<watts>` pairs.
 *
 * @param value - The value to parse.
 * @returns A map of lowercased device id or name to rated wattage.
 */
function parseHeaterWatts(value: string): Map<string, number> {
  const mapping = new Map<string, number>();

  for (const pair of value.split(',')) {
    const trimmedPair = pair.trim();
    if (trimmedPair.length === 0) {
      continue;
    }

    const separatorIndex = trimmedPair.lastIndexOf('=');
    if (separatorIndex < 0) {
      throw new InvalidArgumentError(`'${trimmedPair}' is not a <device>=<watts> pair.`);
    }

    const device = trimmedPair.slice(0, separatorIndex).trim();
    const watts = Number(trimmedPair.slice(separatorIndex + 1).trim());

    if (device.length === 0) {
      throw new InvalidArgumentError(`'${trimmedPair}' is missing a device id or name.`);
    }
    if (!Number.isFinite(watts) || watts <= 0) {
      throw new InvalidArgumentError(`'${trimmedPair}' must specify a wattage greater than zero.`);
    }

    mapping.set(device.toLowerCase(), watts);
  }

  return mapping;
}

export const version = getPackageVersion();

const extraHelpText = `
Copyright (c) 2025 Pascal Bourque
Licensed under the MIT License

Source code and documentation available at: https://github.com/bourquep/mysa2mqtt
`;

export const options = new Command('mysa2mqtt')
  .version(version)
  .description('Expose Mysa smart thermostats to home automation platforms via MQTT.')
  .addHelpText('afterAll', extraHelpText)
  .addOption(
    new Option('-l, --log-level <logLevel>', 'log level')
      .choices(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .env('M2M_LOG_LEVEL')
      .default('info')
      .helpGroup('Configuration')
  )
  .addOption(
    new Option('-f, --log-format <logFormat>', 'log format')
      .choices(['pretty', 'json'])
      .env('M2M_LOG_FORMAT')
      .default('pretty')
      .helpGroup('Configuration')
  )
  .addOption(
    new Option('-H, --mqtt-host <mqttHost>', 'hostname of the MQTT broker')
      .env('M2M_MQTT_HOST')
      .makeOptionMandatory()
      .helpGroup('MQTT')
  )
  .addOption(
    new Option('-P, --mqtt-port <mqttPort>', 'port of the MQTT broker')
      .env('M2M_MQTT_PORT')
      .argParser(parseRequiredInt)
      .default(1883)
      .helpGroup('MQTT')
  )
  .addOption(
    new Option('-U, --mqtt-username <mqttUsername>', 'username of the MQTT broker')
      .env('M2M_MQTT_USERNAME')
      .helpGroup('MQTT')
  )
  .addOption(
    new Option('-B, --mqtt-password <mqttPassword>', 'password of the MQTT broker')
      .env('M2M_MQTT_PASSWORD')
      .helpGroup('MQTT')
  )
  .addOption(
    new Option('-u, --mysa-username <mysaUsername>', 'Mysa account username')
      .env('M2M_MYSA_USERNAME')
      .makeOptionMandatory()
      .helpGroup('Mysa')
  )
  .addOption(
    new Option('-p, --mysa-password <mysaPassword>', 'Mysa account password')
      .env('M2M_MYSA_PASSWORD')
      .makeOptionMandatory()
      .helpGroup('Mysa')
  )
  .addOption(
    new Option('-N, --mqtt-client-name <mqttClientName>', 'name of the MQTT client')
      .env('M2M_MQTT_CLIENT_NAME')
      .default('mysa2mqtt')
      .helpGroup('MQTT')
  )
  .addOption(
    new Option('-T, --mqtt-topic-prefix <mqttTopicPrefix>', 'prefix of the MQTT topic')
      .env('M2M_MQTT_TOPIC_PREFIX')
      .default('mysa2mqtt')
      .helpGroup('MQTT')
  )
  .addOption(
    new Option('--temperature-unit <temperatureUnit>', 'temperature unit (C or F)')
      .env('M2M_TEMPERATURE_UNIT')
      .choices(['C', 'F'])
      .default('C')
      .helpGroup('Configuration')
  )
  .addOption(
    new Option(
      '--heater-watts <heaterWatts>',
      'rated wattage of the heaters controlled by each thermostat, as a comma-separated list of <device>=<watts> pairs, where <device> is a device id or name (e.g. "Kitchen=1500,<device-id>=750"). Required for V2 thermostats to report power, as they do not measure current themselves'
    )
      .env('M2M_HEATER_WATTS')
      .argParser(parseHeaterWatts)
      .helpGroup('Configuration')
  )
  .addOption(
    new Option(
      '--poll-interval-seconds <pollIntervalSeconds>',
      'how often, in seconds, to refresh device state from the Mysa REST API. This keeps Home Assistant current even ' +
        'when the real-time connection cannot be established or is unstable. Set to 0 to disable, or to at least 30'
    )
      .env('M2M_POLL_INTERVAL_SECONDS')
      .argParser(parsePollInterval)
      .default(60)
      .helpGroup('Configuration')
  )
  .addOption(
    new Option(
      '--heartbeat-file <heartbeatFile>',
      'file touched on every message received from the Mysa cloud, for external liveness checks'
    )
      .env('M2M_HEARTBEAT_FILE')
      .helpGroup('Configuration')
  )
  .parse()
  .opts();

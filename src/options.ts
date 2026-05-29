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
import { version } from './version';

configDotenv({
  path: ['.env', '.env.local'],
  override: true
});

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
 * Parses a positive floating-point value.
 *
 * @param value - The value to parse.
 * @returns The parsed positive number.
 */
function parsePositiveFloat(value: string) {
  const parsedValue = parseFloat(value);
  if (isNaN(parsedValue) || parsedValue <= 0) {
    throw new InvalidArgumentError('Must be a positive number.');
  }
  return parsedValue;
}

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
    new Option('-s, --mysa-session-file <mysaSessionFile>', 'Mysa session file')
      .env('M2M_MYSA_SESSION_FILE')
      .default('session.json')
      .helpGroup('Configuration')
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
    new Option('--system-sensors <enabled>', 'expose host system metrics as Home Assistant sensors')
      .env('M2M_SYSTEM_SENSORS')
      .choices(['true', 'false'])
      .default('false')
      .helpGroup('Adapters')
  )
  .addOption(
    new Option(
      '--tesla-wall-connector-host <host>',
      'hostname/IP of a Tesla Wall Connector (Gen 3) to bridge (monitor-only)'
    )
      .env('M2M_TESLA_WALL_CONNECTOR_HOST')
      .helpGroup('Adapters')
  )
  .addOption(
    new Option(
      '--mysa-estimated-current <amps>',
      'estimated current (A) used to compute power for devices that do not report it (e.g. Lite models)'
    )
      .env('M2M_MYSA_ESTIMATED_CURRENT')
      .argParser(parsePositiveFloat)
      .helpGroup('Mysa')
  )
  .addOption(
    new Option('--mysa-energy-api <enabled>', "experimental: read energy from Mysa's cloud energy API")
      .env('M2M_MYSA_ENERGY_API')
      .choices(['true', 'false'])
      .default('false')
      .helpGroup('Mysa')
  )
  .addOption(
    new Option(
      '--mysa-diagnostics <enabled>',
      'write a redacted local diagnostics report (probes Mysa endpoints and captures sample realtime messages)'
    )
      .env('M2M_MYSA_DIAGNOSTICS')
      .choices(['true', 'false'])
      .default('false')
      .helpGroup('Mysa')
  )
  .addOption(
    new Option('--mysa-diagnostics-file <path>', 'path for the diagnostics report')
      .env('M2M_MYSA_DIAGNOSTICS_FILE')
      .default('mysa-diagnostics.json')
      .helpGroup('Mysa')
  )
  .parse()
  .opts();

import { Command, InvalidArgumentError, Option } from 'commander';
import { configDotenv } from 'dotenv';
import { readFile, rm, writeFile } from 'fs/promises';
import { MqttSettings } from 'mqtt2ha';
import { MysaApiClient, MysaSession } from 'mysa-js-sdk';
import { pino } from 'pino';
import { PinoLogger } from './logger';
import { Thermostat } from './thermostat';

configDotenv({
  path: ['.env', '.env.local'],
  override: true
});

/**
 * Parses a required integer value.
 *
 * @param value - The value to parse.
 * @returns The parsed integer value.
 * @throws InvalidArgumentError if the value is not a valid integer.
 */
function parseRequiredInt(value: string) {
  const parsedValue = parseInt(value);
  if (isNaN(parsedValue)) {
    throw new InvalidArgumentError('Must be a number.');
  }
  return parsedValue;
}

const options = new Command('mysa2mqtt')
  .version('0.0.0')
  .description('Expose Mysa smart thermostats to home automation platforms via MQTT.')
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
  .parse()
  .opts();

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

  let session: MysaSession | undefined;
  try {
    rootLogger.debug('Loading Mysa session...');
    const sessionJson = await readFile(options.mysaSessionFile, 'utf8');
    session = JSON.parse(sessionJson);
  } catch {
    rootLogger.debug('No valid Mysa session file found.');
  }
  const client = new MysaApiClient(session, { logger: new PinoLogger(rootLogger.child({ module: 'mysa-js-sdk' })) });

  client.emitter.on('sessionChanged', async (newSession) => {
    if (newSession) {
      rootLogger.debug('Saving new Mysa session...');
      await writeFile(options.mysaSessionFile, JSON.stringify(newSession));
    } else {
      try {
        rootLogger.debug('Removing Mysa session file...');
        await rm(options.mysaSessionFile);
      } catch {
        // Ignore error if file does not exist
      }
    }
  });

  if (!client.isAuthenticated) {
    rootLogger.info('Logging in...');
    await client.login(options.mysaUsername, options.mysaPassword);
  }

  const [devices, firmwares] = await Promise.all([client.getDevices(), client.getDeviceFirmwares()]);

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
        new PinoLogger(rootLogger.child({ module: 'thermostat' })),
        firmwares.Firmware[device.Id]
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

import { configDotenv } from 'dotenv';
import { readFile, rm, writeFile } from 'fs/promises';
import { MqttSettings } from 'mqtt2ha';
import { MysaApiClient, MysaSession } from 'mysa-js-sdk';
import { pino } from 'pino';
import { Thermostat } from './thermostat';

configDotenv({
  path: ['.env', '.env.local'],
  override: true
});

const rootLogger = pino({
  name: 'mysa2mqtt',
  level: process.env.M2M_LOG_LEVEL,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      singleLine: true,
      ignore: 'hostname,module',
      messageFormat: '\x1b[33m[{module}]\x1b[39m {msg}'
    }
  }
}).child({ module: 'mysa2mqtt' });

/** Mysa2mqtt entry-point. */
async function main() {
  rootLogger.info('Starting mysa2mqtt...');

  let session: MysaSession | undefined;
  try {
    rootLogger.debug('Loading Mysa session...');
    const sessionJson = await readFile('session.json', 'utf8');
    session = JSON.parse(sessionJson);
  } catch {
    rootLogger.debug('No valid Mysa session file found.');
  }
  const client = new MysaApiClient(session, { logger: rootLogger.child({ module: 'mysa-js-sdk' }) });

  client.emitter.on('sessionChanged', async (newSession) => {
    if (newSession) {
      rootLogger.debug('Saving new Mysa session...');
      await writeFile('session.json', JSON.stringify(newSession));
    } else {
      try {
        rootLogger.debug('Removing Mysa session file...');
        await rm('session.json');
      } catch {
        // Ignore error if file does not exist
      }
    }
  });

  if (!client.isAuthenticated) {
    rootLogger.info('Logging in...');
    const username = process.env.M2M_MYSA_USERNAME;
    const password = process.env.M2M_MYSA_PASSWORD;

    if (!username || !password) {
      throw new Error('Missing M2M_MYSA_USERNAME or M2M_MYSA_PASSWORD environment variables.');
    }

    await client.login(username, password);
  }

  const [devices, firmwares] = await Promise.all([client.getDevices(), client.getDeviceFirmwares()]);

  const mqttSettings: MqttSettings = {
    host: process.env.M2M_MQTT_HOST || 'localhost',
    port: parseInt(process.env.M2M_MQTT_PORT || '1883'),
    username: process.env.M2M_MQTT_USERNAME,
    password: process.env.M2M_MQTT_PASSWORD,
    client_name: 'mysa2mqtt',
    state_prefix: 'mysa2mqtt'
  };

  const thermostats = Object.entries(devices.DevicesObj).map(
    ([, device]) =>
      new Thermostat(
        client,
        device,
        mqttSettings,
        rootLogger.child({ module: 'thermostat' }),
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

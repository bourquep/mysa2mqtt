import { configDotenv } from 'dotenv';
import 'dotenv/config';
import { readFile, rm, writeFile } from 'fs/promises';
import { MysaApiClient, MysaSession } from 'mysa-js-sdk';
import { pino } from 'pino';

configDotenv({
  path: ['.env', '.env.local'],
  override: true
});

const rootLogger = pino({
  name: 'mysa2mqtt',
  level: process.env.MYSA_2_MQTT_LOG_LEVEL,
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
  rootLogger.debug('Starting mysa2mqtt...');

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
    const username = process.env.MYSA_2_MQTT_USERNAME;
    const password = process.env.MYSA_2_MQTT_PASSWORD;

    if (!username || !password) {
      throw new Error('Missing MYSA_2_MQTT_USERNAME or MYSA_2_MQTT_PASSWORD environment variables.');
    }

    await client.login(username, password);
  }

  const devices = await client.getDevices();

  client.emitter.on('statusChanged', (status) => {
    try {
      const device = devices.DevicesObj[status.deviceId];
      const watts = status.current !== undefined ? status.current * device.Voltage : undefined;
      rootLogger.info(
        `'${device.Name}' status changed: ${status.temperature}°C, ${status.humidity}%, ${watts ?? 'na'}W`
      );
    } catch (error) {
      rootLogger.error(`Error processing status update for device '${status.deviceId}':`, error);
    }
  });

  client.emitter.on('stateChanged', (change) => {
    try {
      const device = devices.DevicesObj[change.deviceId];
      rootLogger.info(change, `'${device.Name}' state changed.`);
    } catch (error) {
      rootLogger.error(`Error processing setpoint update for device '${change.deviceId}':`, error);
    }
  });

  for (const device of Object.entries(devices.DevicesObj)) {
    await client.startRealtimeUpdates(device[0]);
  }
}

main().catch((error) => {
  rootLogger.fatal(error);
  process.exit(1);
});

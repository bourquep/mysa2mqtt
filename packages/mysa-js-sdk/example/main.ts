import { MysaApiClient, MysaSession } from '@/api';
import 'dotenv/config';
import { readFile, rm, writeFile } from 'fs/promises';
import { pino } from 'pino';

const rootLogger = pino({
  name: 'example',
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      singleLine: true,
      ignore: 'hostname,module',
      messageFormat: '\x1b[33m[{module}]\x1b[39m {msg}'
    }
  }
}).child({ module: 'example' });

/** Main entry point of the example application. */
async function main() {
  let session: MysaSession | undefined;
  try {
    rootLogger.info('Loading session...');
    const sessionJson = await readFile('session.json', 'utf8');
    session = JSON.parse(sessionJson);
  } catch {
    rootLogger.info('No valid session file found.');
  }
  const client = new MysaApiClient(session, { logger: rootLogger.child({ module: 'mysa-js-sdk' }) });

  client.emitter.on('sessionChanged', async (newSession) => {
    if (newSession) {
      rootLogger.info('Saving new session...');
      await writeFile('session.json', JSON.stringify(newSession));
    } else {
      try {
        rootLogger.info('Removing session file...');
        await rm('session.json');
      } catch {
        // Ignore error if file does not exist
      }
    }
  });

  if (!client.isAuthenticated) {
    rootLogger.info('Logging in...');
    const username = process.env.MYSA_USERNAME;
    const password = process.env.MYSA_PASSWORD;

    if (!username || !password) {
      throw new Error('Missing MYSA_USERNAME or MYSA_PASSWORD environment variables.');
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

  client.emitter.on('setPointChanged', (change) => {
    try {
      const device = devices.DevicesObj[change.deviceId];
      rootLogger.info(`'${device.Name}' setpoint changed from ${change.previousSetPoint} to ${change.newSetPoint}`);
    } catch (error) {
      rootLogger.error(`Error processing setpoint update for device '${change.deviceId}':`, error);
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
  rootLogger.error(error, 'Error in main');
});

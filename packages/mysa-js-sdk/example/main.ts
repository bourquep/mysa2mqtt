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

  if (process.env.MYSA_OUTPUT_RAW_DATA === 'true') {
    client.emitter.on('rawRealtimeMessageReceived', (data) => {
      rootLogger.info(data, 'Raw message received');
    });
  } else {
    client.emitter.on('statusChanged', (status) => {
      try {
        const device = devices.DevicesObj[status.deviceId];
        const watts =
          status.current !== undefined && device.Voltage !== undefined ? status.current * device.Voltage : undefined;
        rootLogger.info(
          `[${status.deviceId}] '${device.Name ?? 'Unknown'}' status changed: ${status.temperature}°C, ${status.humidity}%, ${watts ?? 'na'}W`
        );
      } catch (error) {
        rootLogger.error(error, `Error processing status update for device '${status.deviceId}'`);
      }
    });

    client.emitter.on('setPointChanged', (change) => {
      try {
        const device = devices.DevicesObj[change.deviceId];
        rootLogger.info(
          `'${device.Name ?? 'Unknown'}' setpoint changed from ${change.previousSetPoint} to ${change.newSetPoint}`
        );
      } catch (error) {
        rootLogger.error(error, `Error processing setpoint update for device '${change.deviceId}'`);
      }
    });

    client.emitter.on('stateChanged', (change) => {
      try {
        const device = devices.DevicesObj[change.deviceId];
        rootLogger.info(change, `'${device.Name ?? 'Unknown'}' state changed.`);
      } catch (error) {
        rootLogger.error(error, `Error processing state update for device '${change.deviceId}'`);
      }
    });
  }

  await Promise.all(
    Object.entries(devices.DevicesObj).map(async ([deviceId, device]) => {
      const serial = await client.getDeviceSerialNumber(deviceId);
      rootLogger.info(`Serial number for device '${deviceId}' (${device.Name ?? 'Unknown'}): ${serial}`);

      await client.startRealtimeUpdates(deviceId);
    })
  );
}

main().catch((error) => {
  rootLogger.error(error, 'Error in main');
});

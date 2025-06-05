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

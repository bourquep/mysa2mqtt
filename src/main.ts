import { configDotenv } from 'dotenv';
import 'dotenv/config';
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
}

main().catch((error) => {
  rootLogger.fatal(error);
  process.exit(1);
});

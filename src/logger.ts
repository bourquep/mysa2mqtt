import { Logger } from 'mqtt2ha';
import { pino } from 'pino';

export class PinoLogger implements Logger {
  constructor(private readonly logger: pino.Logger) {}

  debug(message: string, ...meta: unknown[]): void {
    const obj = meta.at(0);
    if (obj) {
      this.logger.debug(obj, message, ...meta);
    } else {
      this.logger.debug(message, ...meta);
    }
  }

  info(message: string, ...meta: unknown[]): void {
    const obj = meta.at(0);
    if (obj) {
      this.logger.info(obj, message, ...meta);
    } else {
      this.logger.info(message, ...meta);
    }
  }

  warn(message: string, ...meta: unknown[]): void {
    const obj = meta.at(0);
    if (obj) {
      this.logger.warn(obj, message, ...meta);
    } else {
      this.logger.warn(message, ...meta);
    }
  }

  error(message: string, ...meta: unknown[]): void {
    const obj = meta.at(0);
    if (obj) {
      this.logger.error(obj, message, ...meta);
    } else {
      this.logger.error(message, ...meta);
    }
  }
}

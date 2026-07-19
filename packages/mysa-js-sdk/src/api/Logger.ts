/** Interface for logging operations at different severity levels */
export interface Logger {
  /** Logs a debug message with optional metadata */
  debug(message: string, ...meta: unknown[]): void;

  /** Logs an info message with optional metadata */
  info(message: string, ...meta: unknown[]): void;

  /** Logs a warning message with optional metadata */
  warn(message: string, ...meta: unknown[]): void;

  /** Logs an error message with optional metadata */
  error(message: string, ...meta: unknown[]): void;
}

/** Logger implementation that silently discards all log messages. */
/* eslint-disable @typescript-eslint/no-unused-vars */
export class VoidLogger implements Logger {
  debug(message: string, ...meta: unknown[]): void {}
  info(message: string, ...meta: unknown[]): void {}
  warn(message: string, ...meta: unknown[]): void {}
  error(message: string, ...meta: unknown[]): void {}
}
/* eslint-enable @typescript-eslint/no-unused-vars */

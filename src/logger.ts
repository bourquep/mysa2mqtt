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

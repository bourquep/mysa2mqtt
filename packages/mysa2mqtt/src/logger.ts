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
import pino from 'pino';

export class PinoLogger implements Logger {
  constructor(private readonly logger: pino.Logger) {}

  // meta[0] is pino's merge object and must not be repeated in the
  // interpolation args (it was previously passed twice), and a valid falsy
  // first value (0, '', false) must still be forwarded rather than dropped
  // into the null branch — hence ?? instead of a truthiness check.

  debug(message: string, ...meta: unknown[]): void {
    this.logger.debug(meta.at(0) ?? null, message, ...meta.slice(1));
  }

  info(message: string, ...meta: unknown[]): void {
    this.logger.info(meta.at(0) ?? null, message, ...meta.slice(1));
  }

  warn(message: string, ...meta: unknown[]): void {
    this.logger.warn(meta.at(0) ?? null, message, ...meta.slice(1));
  }

  error(message: string, ...meta: unknown[]): void {
    this.logger.error(meta.at(0) ?? null, message, ...meta.slice(1));
  }
}

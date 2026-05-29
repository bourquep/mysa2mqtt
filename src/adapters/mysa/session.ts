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

import { readFile, rm, writeFile } from 'fs/promises';
import { MysaSession } from 'mysa-js-sdk';
import pino from 'pino';

/**
 * Loads a Mysa session from a file.
 *
 * @param filename - The path to the file containing the session data.
 * @param logger - The logger instance to use for logging.
 * @returns A promise that resolves to the loaded MysaSession object or undefined if the file is not found or invalid.
 */
export async function loadSession(filename: string, logger: pino.Logger): Promise<MysaSession | undefined> {
  try {
    logger.info('Loading Mysa session...');
    const sessionJson = await readFile(filename, 'utf8');
    return JSON.parse(sessionJson);
  } catch {
    logger.info('No valid Mysa session file found.');
  }
}

/**
 * Saves a Mysa session to a file.
 *
 * @param session - The MysaSession object to save.
 * @param filename - The path to the file to save the session data to.
 * @param logger - The logger instance to use for logging.
 * @returns A promise that resolves when the session is saved.
 */
export async function saveSession(
  session: MysaSession | undefined,
  filename: string,
  logger: pino.Logger
): Promise<void> {
  if (session) {
    logger.info('Saving Mysa session...');
    await writeFile(filename, JSON.stringify(session));
  } else {
    try {
      logger.debug('Removing Mysa session file...');
      await rm(filename);
    } catch {
      // Ignore error if file does not exist
    }
  }
}

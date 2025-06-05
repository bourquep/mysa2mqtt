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

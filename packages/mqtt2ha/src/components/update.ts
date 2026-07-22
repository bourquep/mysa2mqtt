/*
mqtt2ha
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

import { ComponentConfiguration } from '@/configuration/component_configuration';
import { ComponentSettings } from '../api/settings';
import { Subscriber } from '../api/subscriber';

/** The JSON payload published on an update entity's state topic. */
export interface UpdatePayload {
  /** The currently installed version. */
  installed_version: string;
  /** The latest available version. When omitted, Home Assistant assumes it is equal to the installed version. */
  latest_version?: string;
  /** Title of the software or firmware update. */
  title?: string;
  /** Summary of the release notes or changelog. */
  release_summary?: string;
  /** URL to the full release notes of the latest version. */
  release_url?: string;
  /** URL of an image representing the update. */
  entity_picture?: string;
  /** Whether the update is currently in progress, or a percentage (0-100) of completion. */
  in_progress?: boolean;
  /** The current progress of an in-progress update, as a percentage (0-100), or `null` when not in progress. */
  update_percentage?: number | null;
}

type StateTopicMap = {
  /**
   * The update state, published either as a plain installed-version string or as a full {@link UpdatePayload} JSON
   * object.
   */
  state_topic: string | UpdatePayload;
};

type CommandTopicMap = {
  command_topic: string;
};

/** Configuration interface for an update component */
export interface UpdateInfo extends ComponentConfiguration<'update'> {
  /** The payload sent to `command_topic` to start the installation. Default is "install". */
  payload_install?: string;
  /** Title of the software or firmware update, used when it is not present in the state payload. */
  title?: string;
  /** URL to the release notes of the latest version, used when it is not present in the state payload. */
  release_url?: string;
  /** Whether to retain the last published state. Default is false. */
  retain?: boolean;
}

/**
 * Represents an update entity in Home Assistant. An update entity reports an installed and latest version and can, when
 * an `install` command topic is provided, trigger an installation.
 */
export class Update extends Subscriber<UpdateInfo, StateTopicMap, CommandTopicMap> {
  private _payload?: string | UpdatePayload;

  /** @returns The last published update state (a plain version string or a full payload). */
  get payload() {
    return this._payload;
  }

  /**
   * Creates a new update instance
   *
   * @param settings - Configuration settings for the update entity
   * @param commandCallback - Callback function invoked when an install command is received
   */
  constructor(
    settings: ComponentSettings<UpdateInfo>,
    commandCallback: (topicName: string, message: string) => Promise<void>
  ) {
    super(settings, ['state_topic'], async () => {}, ['command_topic'], commandCallback);
  }

  /**
   * Reports the current version information.
   *
   * @param payload - The update state. Either a plain installed-version string, or an {@link UpdatePayload} describing
   *   the installed and latest versions and optional metadata.
   */
  async setUpdateState(payload: string | UpdatePayload) {
    this._payload = payload;
    await this.setState('state_topic', payload);
  }
}

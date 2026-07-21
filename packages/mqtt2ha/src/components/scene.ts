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

type CommandTopicMap = {
  command_topic: string;
};

/** Configuration interface for a scene component */
export interface SceneInfo extends ComponentConfiguration<'scene'> {
  /** The payload that represents the scene being activated. Default is "ON". */
  payload_on?: string;
  /** Whether to retain the last published state. Default is false. */
  retain?: boolean;
}

/**
 * Represents a scene in Home Assistant. A scene is command-only: it is activated on demand and holds no state, much
 * like a button.
 */
export class Scene extends Subscriber<SceneInfo, never, CommandTopicMap> {
  /**
   * Creates a new scene instance
   *
   * @param settings - Configuration settings for the scene
   * @param commandCallback - Callback function invoked when the scene is activated
   */
  constructor(
    settings: ComponentSettings<SceneInfo>,
    commandCallback: (topicName: string, message: string) => Promise<void>
  ) {
    super(settings, [], async () => {}, ['command_topic'], commandCallback);
  }
}

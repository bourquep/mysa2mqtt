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
import { Discoverable } from '../api/discoverable';
import { ComponentSettings } from '../api/settings';

type StateTopicMap = {
  state_topic: string;
};

/** Configuration interface for an event component */
export interface EventInfo extends ComponentConfiguration<'event'> {
  /** A list of valid `event_type` strings this event entity can emit. */
  event_types: string[];
}

/**
 * Represents an event in Home Assistant. An event entity emits discrete, stateless events (such as a button press or a
 * doorbell chime) rather than holding a persistent state.
 */
export class Event extends Discoverable<EventInfo, StateTopicMap> {
  /**
   * Creates a new event instance
   *
   * @param settings - Configuration settings for the event
   */
  constructor(settings: ComponentSettings<EventInfo>) {
    super(settings, ['state_topic'], async () => {});
  }

  /**
   * Emits an event.
   *
   * @param eventType - One of the configured {@link EventInfo.event_types}.
   * @param attributes - Optional additional attributes to include in the event payload.
   */
  async trigger(eventType: string, attributes?: Record<string, unknown>) {
    if (!this.component.event_types.includes(eventType)) {
      // Home Assistant rejects any event_type not declared in event_types, so
      // there is nothing to gain from publishing it.
      this.logger.warn(`Event type '${eventType}' is not part of the configured 'event_types'; ignoring.`);
      return;
    }

    // The event payload must not be retained: an event is a momentary
    // occurrence, and a retained payload would re-fire on every reconnect.
    await this.mqttClient.publishAsync(
      this.stateTopics[0].topic,
      JSON.stringify({ event_type: eventType, ...attributes }),
      { retain: false }
    );

    this.stateChangedHandler('state_topic', eventType);
  }
}

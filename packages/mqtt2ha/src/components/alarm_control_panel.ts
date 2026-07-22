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

type StateTopicMap = {
  state_topic: string;
};

type CommandTopicMap = {
  command_topic: string;
};

/** The states an alarm control panel can report. */
export type AlarmState =
  | 'disarmed'
  | 'armed_home'
  | 'armed_away'
  | 'armed_night'
  | 'armed_vacation'
  | 'armed_custom_bypass'
  | 'pending'
  | 'triggered'
  | 'arming'
  | 'disarming';

/** Configuration interface for an alarm control panel component */
export interface AlarmControlPanelInfo extends ComponentConfiguration<'alarm_control_panel'> {
  /** If defined, specifies a code to enable or disable the alarm in the frontend. */
  code?: string;
  /** If true, the code is required to arm the alarm. Default is true. */
  code_arm_required?: boolean;
  /** If true, the code is required to disarm the alarm. Default is true. */
  code_disarm_required?: boolean;
  /** If true, the code is required to trigger the alarm. Default is true. */
  code_trigger_required?: boolean;
  /** A template to render the payload to send to `command_topic`. The `action` and `code` values are available. */
  command_template?: string;
  /** The payload to disarm the alarm. Default is "DISARM". */
  payload_disarm?: string;
  /** The payload to set armed-home mode. Default is "ARM_HOME". */
  payload_arm_home?: string;
  /** The payload to set armed-away mode. Default is "ARM_AWAY". */
  payload_arm_away?: string;
  /** The payload to set armed-night mode. Default is "ARM_NIGHT". */
  payload_arm_night?: string;
  /** The payload to set armed-vacation mode. Default is "ARM_VACATION". */
  payload_arm_vacation?: string;
  /** The payload to set armed-custom-bypass mode. Default is "ARM_CUSTOM_BYPASS". */
  payload_arm_custom_bypass?: string;
  /** The payload to trigger the alarm. Default is "TRIGGER". */
  payload_trigger?: string;
  /** Whether to retain the last published state. Default is false. */
  retain?: boolean;
}

/**
 * Represents an alarm control panel in Home Assistant. It reports its current arming state and receives arm/disarm/
 * trigger commands. The actual arming logic is application-specific and is handled by the supplied command callback;
 * the reported state is set explicitly via {@link AlarmControlPanel.setAlarmState}.
 */
export class AlarmControlPanel extends Subscriber<AlarmControlPanelInfo, StateTopicMap, CommandTopicMap> {
  private _state?: AlarmState;

  /** @returns The current alarm state. */
  get state() {
    return this._state;
  }

  /**
   * Creates a new alarm control panel instance
   *
   * @param settings - Configuration settings for the alarm control panel
   * @param commandCallback - Callback function to handle arm/disarm/trigger commands
   */
  constructor(
    settings: ComponentSettings<AlarmControlPanelInfo>,
    commandCallback: (topicName: string, message: string) => Promise<void>
  ) {
    super(settings, ['state_topic'], async () => {}, ['command_topic'], commandCallback);
  }

  /**
   * Reports the current alarm state.
   *
   * @param state - The alarm state to report.
   */
  async setAlarmState(state: AlarmState) {
    this._state = state;
    await this.setState('state_topic', state);
  }
}

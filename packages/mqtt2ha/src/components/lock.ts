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

/** The states a lock can report. */
export type LockState = 'LOCKED' | 'UNLOCKED' | 'LOCKING' | 'UNLOCKING' | 'JAMMED';

/** Configuration interface for a lock component */
export interface LockInfo extends ComponentConfiguration<'lock'> {
  /** A regular expression to validate a supplied code with. */
  code_format?: string;
  /** If true, assumes state changes immediately without waiting for confirmation. Default is false. */
  optimistic?: boolean;
  /** The payload sent to the lock to lock it. Default is "LOCK". */
  payload_lock?: string;
  /** The payload sent to the lock to unlock it. Default is "UNLOCK". */
  payload_unlock?: string;
  /** The payload sent to the lock to open it. Default is "OPEN". */
  payload_open?: string;
  /** The payload sent to `command_topic` to reset the lock to an unknown state. */
  payload_reset?: string;
  /** The payload received on `state_topic` that represents a locked state. Default is "LOCKED". */
  state_locked?: string;
  /** The payload received on `state_topic` that represents an unlocked state. Default is "UNLOCKED". */
  state_unlocked?: string;
  /** The payload received on `state_topic` that represents a locking (in progress) state. Default is "LOCKING". */
  state_locking?: string;
  /** The payload received on `state_topic` that represents an unlocking (in progress) state. Default is "UNLOCKING". */
  state_unlocking?: string;
  /** The payload received on `state_topic` that represents a jammed state. Default is "JAMMED". */
  state_jammed?: string;
  /** Whether to retain the last published state. Default is false. */
  retain?: boolean;
}

/** Represents a lock in Home Assistant. A lock can be locked, unlocked, or opened. */
export class Lock extends Subscriber<LockInfo, StateTopicMap, CommandTopicMap> {
  private _state?: LockState;

  /** @returns The current state of the lock. */
  get state() {
    return this._state;
  }

  /**
   * Creates a new lock instance
   *
   * @param settings - Configuration settings for the lock
   * @param commandCallback - Callback function to handle lock commands
   */
  constructor(
    settings: ComponentSettings<LockInfo>,
    commandCallback: (topicName: string, message: string) => Promise<void>
  ) {
    super(settings, ['state_topic'], async () => {}, ['command_topic'], commandCallback);
  }

  /** Reports that the lock is locked. */
  async locked() {
    await this.setLockState('LOCKED');
  }

  /** Reports that the lock is unlocked. */
  async unlocked() {
    await this.setLockState('UNLOCKED');
  }

  /**
   * Reports the current lock state.
   *
   * @param state - The lock state to report.
   */
  async setLockState(state: LockState) {
    this._state = state;
    const payloadMap: Record<LockState, string> = {
      LOCKED: this.component.state_locked ?? 'LOCKED',
      UNLOCKED: this.component.state_unlocked ?? 'UNLOCKED',
      LOCKING: this.component.state_locking ?? 'LOCKING',
      UNLOCKING: this.component.state_unlocking ?? 'UNLOCKING',
      JAMMED: this.component.state_jammed ?? 'JAMMED'
    };
    await this.setState('state_topic', payloadMap[state]);
  }
}

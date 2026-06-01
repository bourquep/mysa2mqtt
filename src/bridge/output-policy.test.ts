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

import { describe, expect, it } from 'vitest';
import { OutputPolicy } from './output-policy';

describe('OutputPolicy', () => {
  it('allows everything by default (unrestricted)', () => {
    const policy = OutputPolicy.unrestricted();
    expect(policy.isEnergyOnly).toBe(false);
    expect(policy.allows('energy')).toBe(true);
    expect(policy.allows('telemetry')).toBe(true);
    expect(policy.allows('control')).toBe(true);
    expect(policy.allowsTelemetry).toBe(true);
    expect(policy.allowsControl).toBe(true);
  });

  it('permits only energy output in energy-only mode', () => {
    const policy = new OutputPolicy(true);
    expect(policy.isEnergyOnly).toBe(true);
    expect(policy.allows('energy')).toBe(true);
    expect(policy.allows('telemetry')).toBe(false);
    expect(policy.allows('control')).toBe(false);
    expect(policy.allowsTelemetry).toBe(false);
    expect(policy.allowsControl).toBe(false);
  });

  it('defaults to unrestricted when constructed with no argument', () => {
    expect(new OutputPolicy().allowsControl).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { Event } from '../src/components/event';
import { discoveryConfig, lastClient, mqttSettings, stateTopic } from './helpers';

const STATE = stateTopic('event', 'ev1', 'state');

function makeEvent() {
  const event = new Event({
    mqtt: mqttSettings,
    component: { component: 'event', unique_id: 'ev1', event_types: ['press', 'hold'] }
  });
  return { event, client: lastClient() };
}

describe('Event', () => {
  it('publishes a discovery config with the configured event types', async () => {
    const { event, client } = makeEvent();
    await event.writeConfig();
    const config = discoveryConfig(client, 'event', 'ev1');
    expect(config.component).toBe('event');
    expect(config.event_types).toEqual(['press', 'hold']);
  });

  it('emits a non-retained event payload with the event type and attributes', async () => {
    const { event, client } = makeEvent();
    await event.trigger('press', { duration: 2 });
    const publish = client.publishesFor(STATE).at(-1);
    expect(JSON.parse(publish!.payload)).toEqual({ event_type: 'press', duration: 2 });
    expect(publish?.opts).toMatchObject({ retain: false });
  });

  it('ignores an event type that is not configured', async () => {
    const { event, client } = makeEvent();
    await event.trigger('unknown');
    expect(client.publishesFor(STATE)).toHaveLength(0);
  });
});

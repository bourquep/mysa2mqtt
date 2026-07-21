---
'mqtt2ha': patch
---

Stop `JSON.parse`-ing command payloads, which changed their runtime type (#163).

`Subscriber` used to `JSON.parse` each incoming command payload and fall back to the raw string, then cast the result to the command-map type. Because Home Assistant MQTT command payloads are strings, this meant `'123'` reached handlers as a `number` and `'true'` as a `boolean`, while `'ON'` stayed a `string` — the runtime type depended on the payload's content, contradicting the declared type. The raw string is now passed through unchanged, and `CommandCallback`/`Subscriber` constrain command-map values to `string`. Components that carry a JSON-encoded payload on a command topic are responsible for decoding it in their own handler.

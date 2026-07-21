---
'mqtt2ha': major
'mysa2mqtt': major
---

Fix colliding MQTT discovery topics produced by `cleanString` (#153).

Previously every unsupported character was replaced with a single hyphen, so distinct inputs collided
(`cleanString('a/b') === cleanString('a b')`). Two entities whose names differed only in punctuation received the
**same** discovery topic and silently overwrote each other in Home Assistant.

`cleanString` now uses a reversible, collision-free percent-style encoding: alphanumerics and underscores pass through
unchanged, while every other character (including a literal hyphen) is escaped as `-XX`, where `XX` is the uppercase
hex value of each UTF-8 byte. A hyphen is used as the escape sigil instead of `%` because Home Assistant only accepts
`[A-Za-z0-9_-]` in discovery `node_id`/`object_id` segments.

**Breaking change / migration:** any topic segment derived from a device or entity name that contained characters
outside `[A-Za-z0-9_]` will now have a different name (e.g. `Living-Room` becomes `Living-20Room`). Home Assistant
will create new entities under the new topics. After upgrading, delete the now-orphaned MQTT devices/entities from
Home Assistant (Settings → Devices & services → MQTT) so the stale duplicates are removed.

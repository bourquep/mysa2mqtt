---
'mqtt2ha': patch
---

Stop publishing a meaningless `state_topic` for buttons (#157).

A button is command-only in the Home Assistant MQTT spec, but `Button` was passing a placeholder `state_topic` to satisfy the `Subscriber`/`Discoverable` base classes, which added a retained topic per button. `Subscriber` now supports command-only entities with no state topics (a subscriber is already interactive through its command topics), and `Button` no longer declares a state topic. Stateful subscribers (`Switch`, `Climate`) are unchanged.

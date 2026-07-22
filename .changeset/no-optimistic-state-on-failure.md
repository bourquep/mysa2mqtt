---
'mqtt2ha': patch
---

Climate and Switch no longer publish the commanded state before the command callback has run. Unless the component is configured as optimistic, the new state is now applied only after the callback succeeds, so a failed device command no longer leaves Home Assistant showing a state the device never reached. Optimistic components keep the previous assume-and-publish behaviour.

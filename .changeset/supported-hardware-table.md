---
'mysa2mqtt': patch
---

Refresh the supported hardware table in the README.

Several rows had drifted from the code: V2 (non-Lite) thermostats did not mention that their power figure is an
estimate derived from the duty cycle, in-floor thermostats gained ambient/floor sensor selection, and AC thermostats
gained fan-speed control. The ⚠️ markers and "in progress" wording described those caveats as pending work rather than
as characteristics of the hardware, so the supported families are now marked ✅.

Central-HVAC thermostats (`ST-V1-0`) are listed for the first time, as not supported: they talk to the cloud over AWS
IoT Device Shadows instead of the protocol every other family uses. The row links to the tracking issue and to the
capture instructions, for anyone who owns one and wants to help.

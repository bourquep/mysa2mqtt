---
'mysa2mqtt': patch
---

Stop forwarding fan-mode commands the thermostat's current mode does not support.

Home Assistant's `fan_modes` list is fixed when the entity is discovered, so it has to advertise the union of every
mode's fan speeds. On a device whose modes differ — an AC-V1-0 offers all four speeds in heat and cool but only `auto`
in dry — that means the UI can offer a speed the current mode will not accept. Such a command used to be dropped
silently; worse, the fan speed was validated against the union, so a speed valid in *some* mode was forwarded, and the
resulting command reapplied the current temperature and mode without changing the fan.

Fan-mode commands are now validated against the current mode's own capabilities and a rejected one is logged with the
mode and the speeds that mode does support, instead of disappearing.

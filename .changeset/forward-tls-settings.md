---
'mqtt2ha': patch
---

The tls_key, tls_certfile and tls_ca_cert settings are now actually forwarded to the MQTT client when use_tls is enabled. They were previously accepted and silently ignored, so mutual TLS setups connected without their configured certificates. The files are read at client creation and an unreadable path now fails loudly instead of degrading silently.

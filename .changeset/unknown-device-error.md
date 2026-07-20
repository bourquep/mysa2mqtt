---
'mysa-js-sdk': patch
---

setDeviceState now throws a descriptive UnknownDeviceError when the device id does not match any device on the account, instead of failing with a raw TypeError on an undefined dereference.

---
'mysa2mqtt': patch
---

Record a `--heartbeat-file` beat after every successful REST state poll, not only on real-time messages.

A thermostat that is unplugged, powered off or off the network stops the real-time stream while mysa2mqtt itself stays
healthy and keeps polling. The heartbeat file then went stale, so a liveness probe watching its mtime restarted the
process every few minutes for as long as the thermostat stayed offline — restarts that could not fix anything, and that
re-authenticated against the Mysa cloud each time.

The heartbeat now means "mysa2mqtt can still reach the Mysa cloud", which is what a liveness probe can usefully act on.
Detection of a wedged real-time connection is unaffected in practice: since REST polling was added, a wedged real-time
path no longer freezes Home Assistant, and the poll fails alongside the real-time stream whenever the cause is on
mysa2mqtt's side. Accounts that disable polling with `--poll-interval-seconds 0` keep the previous real-time-only
behaviour.

---
'mysa2mqtt': patch
---

Publish a Docker image for the current release. 3.2.2 shipped to npm without one because the release workflow read a
`changesets/action` output that v2 had renamed, leaving the version empty and skipping the image build.

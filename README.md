# mysa2mqtt

<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->

[![All Contributors](https://img.shields.io/badge/all_contributors-6-orange.svg?style=flat-square)](#contributors-)

<!-- ALL-CONTRIBUTORS-BADGE:END -->

[![NPM Version](https://img.shields.io/npm/v/mysa2mqtt)](https://www.npmjs.com/package/mysa2mqtt)
[![Docker Hub](https://img.shields.io/docker/pulls/bourquep/mysa2mqtt)](https://hub.docker.com/r/bourquep/mysa2mqtt)
[![CodeQL](https://github.com/bourquep/mysa2mqtt/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/bourquep/mysa2mqtt/actions/workflows/github-code-scanning/codeql)
[![CI](https://github.com/bourquep/mysa2mqtt/actions/workflows/ci.yml/badge.svg)](https://github.com/bourquep/mysa2mqtt/actions/workflows/ci.yml)

Expose Mysa smart thermostats to Home Assistant and other home automation platforms via MQTT.

```bash
npx mysa2mqtt --help
# or
docker run --rm bourquep/mysa2mqtt --help
```

📖 **[Full mysa2mqtt documentation →](packages/mysa2mqtt#readme)** — installation, configuration, Home
Assistant integration, Docker usage and troubleshooting.

## Packages

This repository is a monorepo. Each package is published to npm independently, under its own version
line, and can be used on its own.

| Package                                     | Version                                                                                            | Description                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [`mysa2mqtt`](packages/mysa2mqtt)           | [![npm](https://img.shields.io/npm/v/mysa2mqtt)](https://www.npmjs.com/package/mysa2mqtt)           | The command-line tool and Docker image.                                 |
| [`mysa-js-sdk`](packages/mysa-js-sdk)       | [![npm](https://img.shields.io/npm/v/mysa-js-sdk)](https://www.npmjs.com/package/mysa-js-sdk)       | JavaScript SDK for accessing Mysa smart thermostats.                    |
| [`mqtt2ha`](packages/mqtt2ha)               | [![npm](https://img.shields.io/npm/v/mqtt2ha)](https://www.npmjs.com/package/mqtt2ha)               | Create MQTT entities that Home Assistant discovers automatically.       |

API documentation for the two libraries is published at
**[bourquep.github.io/mysa2mqtt](https://bourquep.github.io/mysa2mqtt/)**.

> `mysa-js-sdk` and `mqtt2ha` previously lived in their own repositories. They were merged here in
> July 2026 so that a fix spanning several layers is a single pull request and a single release.
> Their old repositories are archived and remain readable.

## Reporting issues

All three packages share this issue tracker. When you
[open an issue](https://github.com/bourquep/mysa2mqtt/issues/new/choose), pick the affected package
from the dropdown — if you're not sure which layer is at fault, choose "Not sure" and it'll get
triaged.

## Development

```bash
npm ci
npm run build      # builds mqtt2ha, then mysa-js-sdk, then mysa2mqtt
npm run lint
npm run typecheck
```

Releases are managed with [changesets](https://github.com/changesets/changesets). Add one with
`npm run changeset` in any PR that should ship a new version; see
[`.changeset/README.md`](.changeset/README.md) for the conventions used here.

Git tags are named `<package>@<version>` (for example `mysa-js-sdk@2.1.0`). Tags of the form
`v1.2.3` are pre-monorepo `mysa2mqtt` releases and are kept for their GitHub Release pages.

See [CONTRIBUTING.md](CONTRIBUTING.md) for more.

## License

MIT — see [LICENSE.txt](LICENSE.txt).

Copyright © 2025-2026 Pascal Bourque.

## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/remiolivier"><img src="https://avatars.githubusercontent.com/u/1379047?v=4?s=100" width="100px;" alt="remiolivier"/><br /><sub><b>remiolivier</b></sub></a><br /><a href="https://github.com/bourquep/mysa2mqtt/commits?author=remiolivier" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Terwox"><img src="https://avatars.githubusercontent.com/u/17753313?v=4?s=100" width="100px;" alt="James Myers"/><br /><sub><b>James Myers</b></sub></a><br /><a href="https://github.com/bourquep/mysa2mqtt/commits?author=Terwox" title="Code">💻</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors)
specification. Contributions of any kind welcome!

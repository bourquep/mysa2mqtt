# mqtt2ha

## 4.1.5

### Patch Changes

- [#187](https://github.com/bourquep/mysa2mqtt/pull/187) [`7affd92`](https://github.com/bourquep/mysa2mqtt/commit/7affd92614ee6f8ac160afacae7c7ea1c3a2a9e9) Thanks [@vavallee](https://github.com/vavallee)! - Errors thrown while subscribing to command topics or handling a received command are now caught and logged instead of escaping as unhandled promise rejections, which could terminate the process under Node's default rejection policy.

## 4.1.4

### Patch Changes

- [#149](https://github.com/bourquep/mysa2mqtt/pull/149) [`89e2950`](https://github.com/bourquep/mysa2mqtt/commit/89e2950c4874db14ea9b682380c63984aaf7a9f4) Thanks [@bourquep](https://github.com/bourquep)! - Moved development into the [mysa2mqtt monorepo](https://github.com/bourquep/mysa2mqtt).

  There are no functional changes in this release. The package's repository and homepage links now point at the monorepo, and issues for all three packages are tracked at https://github.com/bourquep/mysa2mqtt/issues.

## Releases prior to 4.1.3

This package previously lived in its own repository and used semantic-release, which published its release notes to GitHub Releases rather than to a changelog file.

See the [release history of the archived repository](https://github.com/bourquep/mqtt2ha/releases) for notes on versions up to and including 4.1.3.

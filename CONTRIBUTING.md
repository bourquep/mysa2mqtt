# Contributing to mysa2mqtt

First off, thank you for considering contributing! Contributions from the community are essential in making this project
better. Whether you want to report a bug, propose new features, improve documentation or submit code changes, I welcome
your input and assistance. This guide will help you get started.

## This repository is a monorepo

Three packages live here, each published to npm independently under its own version line:

| Package                               | What it is                                                        |
| ------------------------------------- | ----------------------------------------------------------------- |
| [`mysa2mqtt`](packages/mysa2mqtt)     | The command-line tool and Docker image. Depends on the other two. |
| [`mysa-js-sdk`](packages/mysa-js-sdk) | JavaScript SDK for accessing Mysa smart thermostats.              |
| [`mqtt2ha`](packages/mqtt2ha)         | Create MQTT entities that Home Assistant discovers automatically. |

`mysa-js-sdk` and `mqtt2ha` were developed in separate repositories until July 2026. They were merged here so that a fix
spanning several layers is a single pull request and a single release, instead of a chain of releases across repos. They
remain independent, reusable libraries — the merge changed where the code lives, not who can use it.

**A practical consequence:** if a bug turns out to live in the SDK rather than in the CLI, you do not need to move
anything. Fix it in `packages/mysa-js-sdk`, in the same branch and the same pull request.

## Reporting issues

All three packages share [this issue tracker](https://github.com/bourquep/mysa2mqtt/issues/new/choose). The issue form
asks which package is affected — if you aren't sure which layer is at fault, choose **"Not sure"** and it'll get
triaged. That's the common case for bug reports and it's completely fine.

## Development environment

You need **Node.js 24.15.0 or higher** (see `engines` in the package manifests). The bundled npm is fine — workspace
support has been present since npm 7.

1. Fork the repository on GitHub
2. Clone your fork locally and navigate into it
3. Install dependencies **from the repository root**:

```bash
npm ci
```

This installs every package's dependencies at once and links `mysa-js-sdk` and `mqtt2ha` into `node_modules` as symlinks
into `packages/`. Do not run `npm install` inside an individual package directory — there is a single lockfile at the
root, and installing from a subdirectory will corrupt it.

### Project structure

```
mysa2mqtt/
├── .changeset/                    # Pending release notes (see "Releasing" below)
├── .github/
│   ├── ISSUE_TEMPLATE/            # Issue forms, with a package selector
│   └── workflows/
│       ├── ci.yml                 # Lint, typecheck, build, Docker smoke test
│       ├── release.yml            # Changesets → npm + Docker Hub
│       ├── documentation.yml      # TypeDoc → GitHub Pages
│       └── codeql.yml             # Security scanning
├── docs-landing/                  # Landing page for the published docs site
├── packages/
│   ├── mysa2mqtt/                 # The CLI (src/, Dockerfile, tsup + tsconfig)
│   ├── mysa-js-sdk/               # The SDK (src/, example/, typedoc.json)
│   └── mqtt2ha/                   # The HA library (src/, test-environment/)
├── eslint.config.js               # Shared — one config for all packages
├── prettier.config.cjs            # Shared
├── tsconfig.base.json             # Shared compiler options only (see caveat below)
├── package.json                   # Workspace root; all tooling devDependencies
└── package-lock.json              # The single lockfile
```

Linting, formatting and the shared TypeScript options live at the root. Anything genuinely package-specific — the tsup
config, the TypeDoc config, `tsconfig.json`, `README.md`, `CHANGELOG.md` — stays with its package.

### Everyday commands

Run these from the repository root:

```bash
npm run build       # Builds mqtt2ha, then mysa-js-sdk, then mysa2mqtt
npm run typecheck   # Builds first, then typechecks every package
npm run lint        # ESLint
npm run style-lint  # Prettier check
npm run style-fix   # Prettier write
npm run build:docs  # TypeDoc for both libraries
```

To run a script in one package only, use `-w`:

```bash
npm run build -w mysa-js-sdk
npm run dev -w mysa2mqtt
```

**Build order matters, and typecheck depends on it.** `mysa2mqtt` imports the two libraries through workspace symlinks
whose type declarations point at their `dist/` output. If you typecheck before building, you'll get a confusing "cannot
find module 'mysa-js-sdk'". The root `typecheck` script builds first for exactly this reason.

### A caveat about `tsconfig.base.json`

The base config deliberately holds only the options that all three packages already shared. Do not move `target`, `lib`
or `module` into it. Without an explicit `lib`, TypeScript implicitly includes the DOM library, where `response.json()`
returns `Promise<any>`; adding `lib: ["ES2022"]` drops DOM, the Node types take over, the return becomes
`Promise<unknown>`, and the SDK stops compiling. Each package keeps the effective configuration it has always had.

Similarly, the `@/*` path alias must stay in each package's own `tsconfig.json`. There is no `baseUrl`, so `paths`
resolve relative to the file that declares them — hoisting the alias would silently point it at the repository root.

## Submitting pull requests

### Development workflow

1. Create a branch for your change
2. Make your changes, in as many packages as the fix actually requires
3. Add a changeset if the change should ship: `npm run changeset`
4. Run `npm run style-lint`, `npm run lint`, `npm run build`, `npm run typecheck`
5. Commit using the conventional commit format
6. Push and open a pull request

### Releasing, and what a changeset is

Releases are managed by [changesets](https://github.com/changesets/changesets). When you make a change that users should
see, run:

```bash
npm run changeset
```

It asks which packages changed and whether each is a major, minor or patch change, then writes a small Markdown file
into `.changeset/`. Commit that file with your work. The text you write becomes the release note, so write it for users
rather than for reviewers.

Some guidance:

- **You usually don't need a changeset for `mysa2mqtt` when only a library changed.** It depends on both libraries, so
  changesets bumps it automatically and records "Updated dependencies" in its changelog.
- Changes with no user-visible effect — refactors, CI tweaks, docs — don't need one. Use `npx changeset add --empty` if
  you want to be explicit.
- Dependency-bump pull requests don't get one automatically. If the bump affects a **runtime** dependency, add a `patch`
  changeset by hand so it actually reaches users.

Merging to `main` does **not** publish anything. It opens (or updates) a pull request titled _"chore: version packages"_
that applies all pending changesets. Publishing to npm and Docker Hub happens when a maintainer merges that pull
request.

Git tags are named `<package>@<version>`, for example `mysa-js-sdk@2.1.0`. Tags of the form `v1.2.3` are pre-monorepo
`mysa2mqtt` releases and are kept because GitHub Releases are attached to them — please don't delete them.

### Conventional commits

This repository uses [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>[optional scope]: <description>
```

The `type` must be one of:

| Type       | Description                                                                        |
| ---------- | ---------------------------------------------------------------------------------- |
| `feat`     | A new feature.                                                                     |
| `fix`      | A bug fix.                                                                         |
| `docs`     | Documentation only changes.                                                        |
| `test`     | Changes to tests.                                                                  |
| `perf`     | A code change that improves performance.                                           |
| `refactor` | A code change that neither fixes a bug nor adds a feature.                         |
| `style`    | Changes that do not affect the meaning of the code (white-space, formatting, etc). |
| `chore`    | Regular maintenance tasks and updates.                                             |
| `build`    | Changes that affect the build system or external dependencies.                     |
| `ci`       | Changes to CI configuration files and scripts.                                     |
| `revert`   | Reverting a previous commit.                                                       |

Use the package name as the scope when a commit is specific to one package, e.g. `fix(mysa-js-sdk): ...`.

Note that commit messages no longer determine version numbers — changesets do. Conventional commits are kept because
they make the history readable, but the release notes come from your changeset, not from your commit message.

### Semantic versioning

Each package is versioned independently according to [semver](https://semver.org/):

- Major for breaking changes
- Minor for new features
- Patch for bug fixes

Because the packages version independently, `mqtt2ha` being at 4.x while `mysa-js-sdk` is at 2.x is expected and correct
— the numbers are not meant to line up.

### Coding standards

1. **TypeScript**: Write all code in TypeScript with proper type annotations.
2. **Documentation**: Use [TSDoc](https://tsdoc.org/) comments for all public APIs. Both libraries publish generated API
   documentation, so exported symbols without comments leave visible gaps.
3. **Clean Code**: Write clear, self-explanatory code with meaningful variable names.
4. **Error Handling**: Properly handle errors and edge cases.

Keep the layering intact: `mysa2mqtt` may depend on both libraries, but the libraries must not depend on each other or
on the CLI. `mqtt2ha` in particular knows nothing about Mysa and should stay that way — it's a general-purpose Home
Assistant library.

### Code style

[ESLint](https://eslint.org/) and [Prettier](https://prettier.io/) are enforced in CI, with a single shared
configuration for the whole workspace:

```bash
npm run lint
npm run style-lint
```

Formatting is not a matter of taste here — run `npm run style-fix` and move on.

### Pull request checklist

- `npm run style-lint` passes
- `npm run lint` passes
- `npm run build` succeeds
- `npm run typecheck` passes
- A changeset is included, if the change should ship to users
- Documentation is updated to reflect your changes
- Commit messages follow the conventional commits format
- You've verified the change works as expected

If your change touches `packages/mysa2mqtt`, CI will also build the Docker image and smoke-test it. If it touches the
`Dockerfile`, it's worth building locally first — note that the build context is the **repository root**, not the
package directory:

```bash
docker build -f packages/mysa2mqtt/Dockerfile -t mysa2mqtt:dev .
```

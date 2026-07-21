# AGENTS.md

Instructions for AI coding agents working in this repository. Human contributors should read
[CONTRIBUTING.md](CONTRIBUTING.md) — this file covers the same ground more tersely, plus the mistakes that are easy to
make here.

## What this repository is

An npm-workspaces monorepo with three independently published packages:

| Package       | Path                   | Role                                                             |
| ------------- | ---------------------- | ---------------------------------------------------------------- |
| `mysa2mqtt`   | `packages/mysa2mqtt`   | CLI + Docker image. Depends on both libraries below.             |
| `mysa-js-sdk` | `packages/mysa-js-sdk` | SDK for Mysa thermostats. Standalone.                            |
| `mqtt2ha`     | `packages/mqtt2ha`     | Home Assistant MQTT discovery library. Knows nothing about Mysa. |

They were three separate repositories until July 2026. Bugs are reported against `mysa2mqtt` but frequently live in one
of the libraries — **fix them where they actually are**, in the same branch. That is the entire reason the repos were
merged.

Layering rule: `mysa2mqtt` may depend on both libraries; the libraries must not depend on each other or on the CLI. Do
not introduce Mysa-specific concepts into `mqtt2ha`.

## Worktree Setup

After creating a worktree, run `npm ci` from the repository root to install dependencies.

## Commands

Always run from the repository root:

```bash
npm ci              # Install. Never `npm install` inside packages/* — one lockfile at the root.
npm run build       # mqtt2ha → mysa-js-sdk → mysa2mqtt, in that order
npm run typecheck   # Builds first, then typechecks
npm run lint
npm run style-lint  # Prettier check; `npm run style-fix` to write
npm run build:docs
npm run build -w mysa-js-sdk   # Single package
```

Before declaring work complete, run: `npm run style-lint && npm run lint && npm run build && npm run typecheck`. All
four must pass.

## There are no tests

No test framework is configured in any package — no vitest, no jest, no test files, no `test` script. Do not run
`npm test`, do not report test results, and do not claim a change is "tested" because the build passed.

If you want to verify behaviour, build and exercise the CLI directly:

```bash
node packages/mysa2mqtt/dist/main.js --help
```

Adding a test framework is a reasonable proposal, but it is a project decision — raise it, don't do it unprompted as
part of an unrelated change.

## Traps specific to this repository

These are real failures that have already happened here. Read them before editing build configuration.

**Build before typecheck.** `mysa2mqtt` resolves the libraries through workspace symlinks whose `types` point at
`dist/`. Typechecking a clean tree fails with "cannot find module 'mysa-js-sdk'" until the libraries are built. The root
`typecheck` script builds first — don't "optimize" that away.

**Do not move `target`, `lib` or `module` into `tsconfig.base.json`.** With no explicit `lib`, TypeScript implicitly
includes the DOM library, where `response.json()` returns `Promise<any>`. Adding `lib: ["ES2022"]` drops DOM, the Node
types take over, the return type becomes `Promise<unknown>`, and `mysa-js-sdk` fails to compile with four `TS2322`
errors. The base config holds only options all three packages already shared. Leave it that way.

**Keep `paths` in each package's own `tsconfig.json`.** There is no `baseUrl`, so `paths` resolve relative to the
declaring file. Hoisting `@/*` would point it at the repository root. `tsc` would error clearly, but esbuild/tsup may
silently fall back to node resolution and emit a subtly wrong bundle.

**npm does not support the `workspace:` protocol.** That is pnpm/yarn. `"mysa-js-sdk": "workspace:*"` fails with
`EUNSUPPORTEDPROTOCOL`. Internal dependencies are declared as plain exact versions (`"mysa-js-sdk": "2.1.0"`); npm links
the local package because its version satisfies the range, and changesets rewrites the pin on every bump.

**The exact pins are deliberate.** Do not "modernize" them to `^`. Loosening them would let a bad library release reach
existing `mysa2mqtt` installs without a `mysa2mqtt` release.

**The Docker build context is the repository root.** Build with
`docker build -f packages/mysa2mqtt/Dockerfile -t mysa2mqtt:dev .`. The final image must contain `dist/` **and**
`package.json` for all three packages — `npm ci` creates the libraries as symlinks into `packages/`, so shipping only
the CLI's `dist/` produces an image where `--help` works but the first real import dies with `ERR_MODULE_NOT_FOUND`. The
Dockerfile's smoke test exists to catch exactly that.

## Releases: never edit versions by hand

Versions in `package.json` and every `CHANGELOG.md` are owned by [changesets](https://github.com/changesets/changesets).
Do not edit either directly, and do not run `npm version`.

For a user-visible change, add a changeset — a Markdown file in `.changeset/`:

```markdown
---
'mysa-js-sdk': patch
---

Fix session refresh when the token expires mid-request.
```

Guidance:

- Valid bumps are `patch`, `minor`, `major`, per package.
- The body becomes the public release note. Write it for users, not reviewers.
- **Usually omit `mysa2mqtt` when only a library changed** — it is bumped automatically as a dependent, and adding a
  redundant entry produces noisy changelogs.
- Refactors, CI changes and docs need no changeset.
- Dependency bumps affecting a **runtime** dependency should get a `patch` changeset added by hand.

Merging to `main` publishes nothing. It opens a "chore: version packages" PR; publishing happens when a maintainer
merges that. Do not attempt to publish, tag, or trigger a release.

Tags are `<package>@<version>`. Tags matching `v*` are pre-monorepo `mysa2mqtt` releases with GitHub Releases attached —
never delete them.

## Conventions

- TypeScript throughout, with real type annotations. Avoid `any`; prefer narrowing over casting.
- [TSDoc](https://tsdoc.org/) comments on all exported symbols — both libraries publish generated API docs, so an
  undocumented export is a visible gap.
- Conventional commits (`fix(mysa-js-sdk): ...`). They no longer drive versioning — changesets do — but keep the format.
- ESLint and Prettier are shared at the root and enforced in CI. Run `npm run style-fix` rather than hand-formatting.
- Match the surrounding code's style. These packages have an established idiom; follow it rather than importing patterns
  from elsewhere.

## Safety

- **Never commit or log credentials.** Mysa account credentials, tokens, and session data are involved throughout.
  `.env` and `.env.local` are gitignored — keep it that way, and never paste their contents into code, commits, issues,
  or pull requests.
- When adding logging, assume the output will be pasted into a public issue. Redact tokens, passwords, email addresses
  and device identifiers.
- This project uses undocumented Mysa APIs. Be conservative about adding new endpoint calls or increasing request
  frequency — aggressive polling affects real users' accounts and risks rate limiting.
- Do not push branches, open or merge pull requests, publish packages, or archive repositories unless explicitly asked.

# Contribution guide

Thank you for your interest in contributing to Engawa! This document explains how to take part in the project: asking questions, reporting issues, sending pull requests, reviewing and releasing.

Technical information for developers (setting up the environment, running tests, and notes on the backend and frontend code) is in the [developer documentation](https://bettaku.github.io/engawa/en/development/).

> [!NOTE]
> The main language of this project is Japanese, **but you don't need to write Issues or pull requests in Japanese.**
> You may receive comments in Japanese, and you don't need to reply in Japanese either.
> Machine translation into Japanese is not very accurate, so writing in your own language is often easier for us to understand. It also lets readers use the translation tool they prefer.

## Table of contents

- [Getting help](#getting-help)
- [Issues](#issues)
- [Discuss before you implement](#discuss-before-you-implement)
- [Branches](#branches)
- [Pull requests](#pull-requests)
- [Reviewing](#reviewing)
- [Releases](#releases)
- [Localization](#localization)
- [Security](#security)

## Getting help

Please ask questions and get troubleshooting help in [GitHub Discussions](https://github.com/bettaku/engawa/discussions). Issues are not for questions.

## Issues

Before creating an issue, please check the following.

- Search for similar issues first to avoid duplicates.
- Choose the right form:
	- **Bug report** for problems you can reproduce
	- **Feature request** for user-facing improvements
	- **Development task** for internal engineering work tracked by maintainers
- Do not report security vulnerabilities in a public issue. See [Security](#security).

> [!WARNING]
> Do not close an issue that is about to be resolved. Keep it open until the commit that actually resolves it is merged.

### How issues are triaged

Maintainers may:

- close an issue that cannot be reproduced on the latest stable release,
- merge an issue into another,
- split an issue into several,
- or reopen an issue whose reason for closing no longer applies.

## Discuss before you implement

Proposals are welcome. When you want to add a feature or fix a non-trivial bug, **first have the design and policy reviewed in an issue** (create one if it doesn't exist). Without this step, a pull request may not be merged even if it is implemented.

In the issue, make clear what the pull request will and will not do, so that others understand its goal. Pull requests without a clear scope tend to grow and become hard to review.

When you start working on it, assign yourself to the issue (or ask a maintainer to assign you). This tells others you are working on it and avoids duplicated work.

## Branches

- **`main`** tracks the latest release.
- **`develop`** is where work for the next release happens. **Target your pull requests at this branch.**

## Pull requests

Before opening a pull request, please check the following.

- Prefix the title with the type of change: `type(scope): summary`.
	- Types: `fix`, `refactor`, `feat`, `enhance`, `perf`, `chore`
	- Examples: `fix(frontend): ...`, `enhance(backend): ...`, `chore(ci): ...`
	- Keep each pull request focused. Don't mix several kinds of changes or concerns in one pull request.
- If the pull request resolves an issue, reference it in the description.
- Add a summary of user-facing changes to [`CHANGELOG_engawa.md`](./CHANGELOG_engawa.md). Changes that don't affect users, such as refactoring, don't need an entry.
- Check whether any documentation needs to be added or updated.
- If you add a feature or fix a bug, add a test case where possible.
- Make sure tests and lint pass: `pnpm test` and `pnpm lint`. See [Testing](https://bettaku.github.io/engawa/en/development/testing/) for details.
- If the pull request changes the UI, attach screenshots to the description.

### ActivityPub payload changes

If a pull request changes the ActivityPub payload:

- Prefix the name of the extension property with `_misskey_` (e.g. `_misskey_quote`).
- Declare the extension property as **optional** in `packages/backend/src/core/activitypub/type.ts`, because payloads from older versions or other implementations may not contain it.
- Add the extension property to the context definition in `packages/backend/src/core/activitypub/misc/contexts.ts`. The key is the property name, and the value is its "short IRI", usually `misskey:<property name>` (e.g. `misskey:_misskey_quote`).
- Do not add a property that another implementation has already defined, and do not add custom values to well-known properties.
- Consider documenting the extension in [misskey-hub's namespace document](https://github.com/misskey-dev/misskey-hub-next/blob/master/content/ns.md).

## Reviewing

Be willing to comment on the good points, not just the things you want fixed. 💯

Points to look at:

- **Scope**: Is the goal of the pull request clear? Is its size appropriate?
- **Security**: Does merging it introduce a vulnerability?
- **Performance**: Does it cause unexpected performance degradation? Is there a more efficient way?
- **Testing**: Do the tests ensure the expected behavior? Are there gaps? Are error cases covered?

## Releases

Releases are managed by the **engawa Release Manager** GitHub App, configured in [`.github/release-manager.yml`](./.github/release-manager.yml). Maintainers drive it with comments.

| Command | Where | What it does |
|---|---|---|
| `/release start <version>` | any issue or PR | Starts a release cycle: bumps to the first prerelease (e.g. `1.1.0-alpha.0`), tags it, publishes a prerelease and opens a draft release pull request (`develop` → `main`) |
| `/release start major\|minor\|patch` | any issue or PR | Same as above, but computes the next version by bumping the current one |
| `/release prerelease [channel]` | release PR | Publishes the next prerelease (e.g. `/release prerelease rc`) |
| `/release merge` | release PR | Checks approval and CI, writes the final version, merges, tags and publishes the release |
| `/release review` | release PR | Posts the release review request |
| `/release sync` | release PR | Re-syncs the release PR description with the changelog |
| `/release status` | any issue or PR | Shows the current release state |

> [!WARNING]
> `/release start` without an argument bumps the **patch** version. Pass the version explicitly when you mean something else (e.g. `/release start 1.1.0`).

The flow is:

1. Run `/release start <version>`. The changelog section `x.x.x (unreleased)` is renamed to the version, and the first `alpha` prerelease is published.
2. Mark the release pull request as ready for review. The App publishes the first `beta`. Run `/release prerelease rc` when you want a release candidate.
3. Deploy, do a quick QA check, and make sure CI passes.
4. Get the release pull request approved, then run `/release merge`.

When a release (including a prerelease) is published, [`release-artifacts.yml`](./.github/workflows/release-artifacts.yml) builds the container image (`ghcr.io/bettaku/engawa`) and the source tarball, and attaches attestations.

## Localization

Locale files live in [`locales/`](./locales/). There is no external translation service.

- `ja-JP.yml` is the source. When you add or change text, edit `ja-JP.yml` first.
- Add the English (`en-US.yml`) and Korean (`ko-KR.yml`) translations in the same pull request.
- Other languages are optional. Improvements to them are welcome.
- After editing locale files, regenerate the type definitions with `pnpm build-assets` (or run `pnpm dev`, which does it automatically).

## Security

Please report security vulnerabilities privately. See the [Security Policy](./SECURITY.md).

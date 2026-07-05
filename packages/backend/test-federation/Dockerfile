# syntax = docker/dockerfile:1.4

# Federation test image.
#
# Unlike the production Dockerfile, this image keeps devDependencies (jest etc.)
# and the full build output so that a single image can serve every role in the
# federation test stack: the CherryPick app servers, the tester, and the daemon.
# Baking dependencies + build output into one image removes the per-container
# `npm install -g pnpm` / `pnpm i` steps that previously ran at container start,
# which were the main source of slowness and flakiness.
#
# Build context must be the repository root.

ARG NODE_VERSION=24.10.0-bookworm

FROM node:${NODE_VERSION}

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
	--mount=type=cache,target=/var/lib/apt,sharing=locked \
	rm -f /etc/apt/apt.conf.d/docker-clean \
	; echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache \
	&& apt-get update \
	&& apt-get install -yqq --no-install-recommends \
	build-essential ffmpeg

WORKDIR /cherrypick

# Copy manifests first so dependency installation is cached independently of source changes.
COPY --link ["pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json", "./"]
COPY --link ["scripts", "./scripts"]
COPY --link ["patches", "./patches"]
COPY --link ["packages/backend/package.json", "./packages/backend/"]
COPY --link ["packages/frontend-shared/package.json", "./packages/frontend-shared/"]
COPY --link ["packages/frontend/package.json", "./packages/frontend/"]
COPY --link ["packages/frontend-embed/package.json", "./packages/frontend-embed/"]
COPY --link ["packages/frontend-builder/package.json", "./packages/frontend-builder/"]
COPY --link ["packages/icons-subsetter/package.json", "./packages/icons-subsetter/"]
COPY --link ["packages/sw/package.json", "./packages/sw/"]
COPY --link ["packages/cherrypick-js/package.json", "./packages/cherrypick-js/"]

# Install pnpm pinned in package.json (packageManager field).
RUN node -e "console.log(JSON.parse(require('node:fs').readFileSync('./package.json')).packageManager)" | xargs npm install -g

# Install with devDependencies (do NOT set NODE_ENV=production here).
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
	pnpm i --frozen-lockfile --aggregate-output

COPY --link . ./

RUN git submodule update --init
RUN pnpm build
RUN rm -rf .git/

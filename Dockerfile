# syntax = docker/dockerfile:1.4

ARG NODE_VERSION=22.15.0-bookworm

# build assets & compile TypeScript

FROM --platform=$BUILDPLATFORM node:${NODE_VERSION} AS native-builder

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
	--mount=type=cache,target=/var/lib/apt,sharing=locked \
	rm -f /etc/apt/apt.conf.d/docker-clean \
	; echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache \
	&& apt-get update \
	&& apt-get install -yqq --no-install-recommends \
	build-essential

WORKDIR /cherrypick

COPY --link ["pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json", "./"]
COPY --link ["scripts", "./scripts"]
COPY --link ["packages/backend/package.json", "./packages/backend/"]
COPY --link ["packages/frontend-shared/package.json", "./packages/frontend-shared/"]
COPY --link ["packages/frontend/package.json", "./packages/frontend/"]
COPY --link ["packages/frontend-embed/package.json", "./packages/frontend-embed/"]
COPY --link ["packages/sw/package.json", "./packages/sw/"]
COPY --link ["packages/cherrypick-js/package.json", "./packages/cherrypick-js/"]
COPY --link ["packages/misskey-bubble-game/package.json", "./packages/misskey-bubble-game/"]

ARG NODE_ENV=production

RUN node -e "console.log(JSON.parse(require('node:fs').readFileSync('./package.json')).packageManager)" | xargs npm install -g

RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
	pnpm i --frozen-lockfile --aggregate-output

COPY --link . ./

RUN git submodule update --init
RUN pnpm build
RUN rm -rf .git/

# build ffmpeg from source
FROM --platform=$TARGETPLATFORM node:${NODE_VERSION}-slim AS ffmpeg-builder

ARG FFMPEG_VERSION="8.0"

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
  autoconf \
  automake \
  build-essential \
	ca-certificates \
  cmake \
	git \
  git-core \
	libaom-dev \
  libass-dev \
  libfreetype6-dev \
  libgnutls28-dev \
  libmp3lame-dev \
  libsdl2-dev \
  libtool \
  libva-dev \
  libvdpau-dev \
  libvorbis-dev \
	libx264-dev \
	libx265-dev \
	libnuma-dev \
	libvpx-dev \
  libxcb1-dev \
  libxcb-shm0-dev \
  libxcb-xfixes0-dev \
	libopus-dev \
	libdav1d-dev \
  meson \
	nasm \
  ninja-build \
  pkg-config \
  texinfo \
	tar \
  wget \
  yasm \
  zlib1g-dev \
	nettle-dev \
	libunistring-dev

WORKDIR /tmp

RUN echo $(uname -m)

RUN wget -O ffmpeg-${FFMPEG_VERSION}.tar.bz2 https://www.ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.bz2 && \
	tar xjvf ffmpeg-${FFMPEG_VERSION}.tar.bz2 && \
	cd ffmpeg-${FFMPEG_VERSION} && \
	PKG_CONFIG_PATH="/usr/lib/$(uname -m)-linux-gnu/pkgconfig:/usr/lib/pkgconfig:/usr/share/pkgconfig" ./configure \
	--prefix="/usr/local" \
	--pkg-config-flags="--static" \
	--extra-libs="-lpthread -lm" \
	--enable-gpl \
	--enable-gnutls \
	--enable-libaom \
	--enable-libass \
	--enable-libfreetype \
	--enable-libmp3lame \
	--enable-libopus \
	--enable-libdav1d \
	--enable-libvorbis \
	--enable-libvpx \
	--enable-libx264 \
	--enable-libx265 && \
	make -j$(nproc) && \
	make install && \
	rm -rf /tmp/*

# build native dependencies for target platform

FROM --platform=$TARGETPLATFORM node:${NODE_VERSION} AS target-builder

RUN apt-get update \
	&& apt-get install -yqq --no-install-recommends \
	build-essential

WORKDIR /cherrypick

COPY --link ["pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json", "./"]
COPY --link ["scripts", "./scripts"]
COPY --link ["packages/backend/package.json", "./packages/backend/"]
COPY --link ["packages/cherrypick-js/package.json", "./packages/cherrypick-js/"]
COPY --link ["packages/misskey-bubble-game/package.json", "./packages/misskey-bubble-game/"]

ARG NODE_ENV=production

RUN node -e "console.log(JSON.parse(require('node:fs').readFileSync('./package.json')).packageManager)" | xargs npm install -g

RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
	pnpm i --frozen-lockfile --aggregate-output

FROM --platform=$TARGETPLATFORM node:${NODE_VERSION}-slim AS runner

ARG UID="991"
ARG GID="991"

COPY --from=ffmpeg-builder /usr/local/bin/ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg-builder /usr/local/bin/ffprobe /usr/local/bin/ffprobe

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
	tini curl libjemalloc-dev libjemalloc2 \
	&& ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so \
	&& groupadd -g "${GID}" cherrypick \
	&& useradd -l -u "${UID}" -g "${GID}" -m -d /cherrypick cherrypick \
	&& find / -type d -path /sys -prune -o -type d -path /proc -prune -o -type f -perm /u+s -ignore_readdir_race -exec chmod u-s {} \; \
	&& find / -type d -path /sys -prune -o -type d -path /proc -prune -o -type f -perm /g+s -ignore_readdir_race -exec chmod g-s {} \; \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists

# add package.json to add pnpm
COPY ./package.json ./package.json
RUN node -e "console.log(JSON.parse(require('node:fs').readFileSync('./package.json')).packageManager)" | xargs npm install -g

USER cherrypick
WORKDIR /cherrypick

COPY --chown=cherrypick:cherrypick --from=target-builder /cherrypick/node_modules ./node_modules
COPY --chown=cherrypick:cherrypick --from=target-builder /cherrypick/packages/backend/node_modules ./packages/backend/node_modules
COPY --chown=cherrypick:cherrypick --from=target-builder /cherrypick/packages/cherrypick-js/node_modules ./packages/cherrypick-js/node_modules
COPY --chown=cherrypick:cherrypick --from=target-builder /cherrypick/packages/misskey-bubble-game/node_modules ./packages/misskey-bubble-game/node_modules
COPY --chown=cherrypick:cherrypick --from=native-builder /cherrypick/built ./built
COPY --chown=cherrypick:cherrypick --from=native-builder /cherrypick/packages/cherrypick-js/built ./packages/cherrypick-js/built
COPY --chown=cherrypick:cherrypick --from=native-builder /cherrypick/packages/misskey-bubble-game/built ./packages/misskey-bubble-game/built
COPY --chown=cherrypick:cherrypick --from=native-builder /cherrypick/packages/backend/built ./packages/backend/built
COPY --chown=cherrypick:cherrypick --from=native-builder /cherrypick/fluent-emojis /cherrypick/fluent-emojis
COPY --chown=cherrypick:cherrypick . ./

ENV LD_PRELOAD=/usr/local/lib/libjemalloc.so
ENV MALLOC_CONF=background_thread:true,metadata_thp:auto,dirty_decay_ms:30000,muzzy_decay_ms:30000
ENV NODE_ENV=production
HEALTHCHECK --interval=5s --retries=20 CMD ["/bin/bash", "/cherrypick/healthcheck.sh"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "run", "migrateandstart"]

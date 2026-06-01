# GingerMail browser-accessible Docker distribution.
#
# This is a CONVENIENCE channel, not the primary install path. Electron is a
# native desktop app; the supported installers are the .dmg / .exe / .AppImage
# attached to each GitHub Release. This image runs the Linux build on a minimal
# KasmVNC desktop so the app is reachable from a browser at https://<host>:3001
# without installing anything natively.
#
# Build:  docker build -t gingermail:dev .
# Run:    docker run -d --name gingermail -p 3001:3001 --shm-size=1g \
#           -v gingermail-data:/config gingermail:dev

# ---------------------------------------------------------------------------
# Stage 1: build the unpacked Linux app with electron-builder.
# ---------------------------------------------------------------------------
FROM node:20-bookworm AS build

# electron-builder needs a few native toolchain bits to rebuild better-sqlite3
# (postinstall runs `electron-builder install-app-deps`).
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /src

# Install deps first for better layer caching.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/main/package.json apps/main/
COPY apps/renderer/package.json apps/renderer/
COPY packages/ai/package.json packages/ai/
COPY packages/core/package.json packages/core/
COPY packages/providers/package.json packages/providers/
COPY packages/storage/package.json packages/storage/
COPY packages/ui-kit/package.json packages/ui-kit/

RUN pnpm install --frozen-lockfile

# Copy the rest of the source and build.
COPY . .

# Build renderer + main + packages, then emit an unpacked Linux tree. We skip
# the Ollama prepackage fetch (matches .github/workflows/release.yml) and never
# publish from inside the build.
RUN pnpm build \
    && pnpm exec electron-builder --linux dir --publish never

# Normalise the versioned output path (release/<version>/linux-unpacked) to a
# stable location the runtime stage can copy from.
# The dir name is arch-suffixed on non-x64 hosts (linux-unpacked,
# linux-arm64-unpacked, ...), so match the family rather than a literal.
RUN set -eux; \
    UNPACKED="$(find release -maxdepth 2 -type d -name 'linux*unpacked' | head -n1)"; \
    test -n "$UNPACKED"; \
    mkdir -p /app; \
    cp -a "$UNPACKED/." /app/

# ---------------------------------------------------------------------------
# Stage 2: runtime on the linuxserver KasmVNC base (browser-accessible desktop).
# ---------------------------------------------------------------------------
FROM lscr.io/linuxserver/baseimage-kasmvnc:debianbookworm

# Electron/Chromium runtime libraries. Alpine/musl was evaluated but the
# prebuilt (glibc-linked) Electron binary cannot relocate against musl even
# with gcompat, so Debian (glibc) is the only viable base. We keep the image
# lean instead: --no-install-recommends avoids pulling suggested extras, and
# the post-install prune drops apt lists, docs, man pages, and locales that the
# headless container never uses.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgtk-3-0 \
        libnss3 \
        libasound2 \
        libgbm1 \
        libxshmfence1 \
        libdrm2 \
        libxss1 \
        libxtst6 \
        libsecret-1-0 \
        libnotify4 \
        libatk-bridge2.0-0 \
        libatspi2.0-0 \
        libcups2 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
        /usr/share/doc/* \
        /usr/share/man/* \
        /usr/share/info/* \
        /usr/share/lintian/* \
        /var/cache/apt/* \
        /tmp/* \
    && find /usr/share/locale -maxdepth 1 -mindepth 1 -type d \
        ! -name 'en*' ! -name 'C*' ! -name 'locale.alias' -exec rm -rf {} +

COPY --from=build /app /opt/gingermail
COPY docker/root/ /

# KasmVNC web UI listens on 3001 (https).
EXPOSE 3001

# Title shown in the KasmVNC browser tab.
ENV TITLE=GingerMail

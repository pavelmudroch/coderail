#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

OWNER="${CODERAIL_OWNER:-pavelmudroch}"
REPO="${CODERAIL_REPO:-coderail}"
VERSION="${CODERAIL_VERSION:-latest}"
DOWNLOAD_URL="https://github.com/$OWNER/$REPO/releases/$VERSION/download/asset-name.zip"
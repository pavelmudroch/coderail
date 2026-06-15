#!/usr/bin/env sh

set -eu

PWD=$(pwd)
SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)
cd "$SCRIPT_DIR"

# do some tests

cd "$PWD"
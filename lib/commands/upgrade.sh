#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr upgrade [options]

  Upgrade this cli tool to latest or specified version.

Options:
  -h, --help            Show this help message and exit
  --version=<version>, --version <version>
                        Upgrade to a specific version, default is latest
  --canary              Upgrade to the latest build from main branch
EOF
}
#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr ticket activate [options] <ticket>

  Activate an open ticket for the current repository.

Options:
  -h, --help            Show this help message and exit

Arguments:
  <ticket>    The ticket to activate, specified by its ID, name, or path
EOF
}
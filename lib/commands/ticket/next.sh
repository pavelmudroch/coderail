#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr ticket next [options]

  List open tickets with satisfied dependencies for the current repository.

Options:
  -h, --help            Show this help message and exit
  --limit <N>           Limit the number of tickets to display, must be
                        a positive integer
EOF
}
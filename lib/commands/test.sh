#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr test [options] [<file> ...]

  Run configured test commands for specified or changed files. At least one
  selector --changed or <file> -- must be provided.

Options:
  -h, --help            Show this help message and exit
  --changed             Run tests for all changed files, git must be available
                        in the current working directory

Arguments:
  <file>                Path to a file to run the tests for
EOF
}
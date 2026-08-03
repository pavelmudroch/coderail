#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr idea [options] <command>

  Manage ideas.

Options:
  -h, --help           Show this help message and exit

Commands:
  map                  Generate map of ideas and their relationships
  create               Create a new idea
  validate             Validate an idea(s) for completeness and consistency
EOF
}
#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr idea create [options] <idea-title>

  Create a new empty idea file with specified title and optional parent idea.

Options:
  -h, --help           Show this help message and exit
  -p, --parent <parent-idea-path>
                       The path to the parent idea

Arguments:
  <idea-title>         The title of the idea to create
EOF
}
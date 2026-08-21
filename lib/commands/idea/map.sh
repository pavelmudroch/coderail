#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr idea map [options]

  Generate tree-like map of ideas, their relationships and statuses.

Options:
  -h, --help           Show this help message and exit
      --json           Output the idea map in JSON format
EOF
}

execute_command()
{
    usage
}
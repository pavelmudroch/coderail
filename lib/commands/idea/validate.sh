#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr idea validate [options]  [<idea_path> ...]

  Validate an idea(s) for completeness and consistency. If no idea path is
  provided, all ideas will be validated. If one or more idea paths are
  specified, only those ideas will be validated.

Options:
  -h, --help           Show this help message and exit

Arguments:
  <idea_path>          Optional idea path to validate
EOF
}

execute_command()
{
    usage
}
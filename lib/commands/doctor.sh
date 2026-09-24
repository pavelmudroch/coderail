#!/usr/bin/env sh

usage()
{
    cat <<'EOF'
Usage:
  cr doctor [options]

  Diagnose current working directory, or coderail installation for potential
  issues and provide recommendations, or automatic fixes

Options:
  -h, --help            Show this help message and exit
      --repair          Attempt to automatically fix detected issues
EOF
}

execute_command()
{
    usage
}

#!/usr/bin/env sh

usage()
{
    cat <<'EOF'
Usage:
  cr upgrade [options]

Options:
  --version <tag>   Specify the version to upgrade to, if not specified, upgrade
                    to the latest release
  --canary          Upgrade to the canary version
  --force           Allow overwriting existing edited instruction, or template
                    files; prompt for confirmation
  --yes             Automatically confirm the prompt
EOF
}

execute_command()
{
}

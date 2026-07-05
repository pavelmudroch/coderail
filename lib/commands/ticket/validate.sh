#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr ticket validate [options] [<ticket> ...]

  Validate the format of tickets for the current repository.

Options:
  -h, --help            Show this help message and exit

Arguments:
  <ticket>    The ticket(s) to validate, specified by their ID, name, or path.
              If no tickets are specified, all tickets will be validated.
EOF
}
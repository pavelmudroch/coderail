#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr ticket [options] <command>

  Ticket management commands for the current repository.

Options:
  -h, --help            Show this help message and exit

Commands:
  create                Create a new ticket for the current repository
  next                  List open tickets with satisfied dependencies
  close                 Close an active ticket
  activate              Activate an open ticket
  reopen                Reopen a closed or active ticket
  validate              Validate tickets format
EOF
}
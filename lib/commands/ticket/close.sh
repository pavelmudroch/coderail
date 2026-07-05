#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr ticket close [options] <ticket>

  Close an active ticket for the current repository.

Options:
  -h, --help            Show this help message and exit
  --reason <reason>
                        The reason for closing the ticket. Can be one of:
                        done, duplicate, deferred, dismissed
                        (default: done)

Arguments:
  <ticket>    The ticket to close, specified by its ID, name, or path
EOF
}
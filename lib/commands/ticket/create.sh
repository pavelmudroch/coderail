#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr ticket create [options] <name>

  Create a new ticket for the current repository.

Options:
  -h, --help            Show this help message and exit
  -d <ticket>, --depends-on <ticket>
                        Specify a ticket that this new ticket depends on. Can be
                        specified multiple times to add multiple dependencies.
                        Accepts ticket ID, name, or path.

Arguments:
  <name>                The name of the ticket to create
EOF
}
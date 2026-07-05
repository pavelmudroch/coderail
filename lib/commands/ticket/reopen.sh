#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr ticket reopen [options] <ticket>

  Reopen a closed or active ticket for the current repository.

Options:
  -h, --help            Show this help message and exit
  -d <ticket>, --depends-on <ticket>
                        Specify a ticket that this reopened ticket depends on.
                        Can be specified multiple times to add multiple dependencies.
                        Accepts ticket ID, name, or path.

Arguments:
  <ticket>    The ticket to reopen, specified by its ID, name, or path
EOF
}
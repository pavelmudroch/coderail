#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr ticket clean [options]

  Clean up tickets for the current repository. Usefull for cleaning up a branch
  befor merging, or checking what tickets are still relevant and what is left
  to be done. Also removing dependencies for deleted closed tickets form open
  tickets.

  This command removes all closed tickets with close reason set to done, or set
  to duplicate, when the original ticket is closed with close reason done.

  Important: There must be no active tickets, otherwise this command will fail.

Options:
  -h, --help            Show this help message and exit
  --dry-run             Only print what would be done, without actually doing it
  --yes                 Do not prompt for confirmation
  --prune               Remove all closed tickets from the repository and also
                        any open tickets that depend on unsatisfied closed
                        ticket.
EOF
}
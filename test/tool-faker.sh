#!/usr/bin/env sh

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/.."
    pwd
)

. "$ROOT_DIR/lib/utils/log.sh"

usage() {
    cat <<'EOF'
Usage:
  test/tool-faker.sh <id | name | path>

  Fake tool worker for ticket loop testing:
  1. activate ticket
  2. wait random 5-20 seconds
  3. close ticket with reason=done
EOF
}

error() {
    log_usage_error "$@"
}

fatal() {
    log_error "$@"
    exit 1
}

random_delay_seconds() {
    awk 'BEGIN { srand(); print int(rand() * 5) + 5 }'
}

should_generate_error() {
    random_value=$(awk 'BEGIN { srand(); print int(rand() * 100) }')
    if [ "$random_value" -lt 10 ]; then
        return 0  # Generate error (10% chance)
    else
        return 1  # No error (90% chance)
    fi
}

argument_count=$#

while [ "$#" -gt 0 ]; do
    case "$1" in
        --help)
            [ "$argument_count" -eq 1 ] || error "--help must be the only argument"
            usage
            exit 0
            ;;
        --help=*)
            error "--help does not accept a value"
            ;;
        --*)
            error "unknown option: $1"
            ;;
        *)
            break
            ;;
    esac
done

[ "$#" -gt 0 ] || error "missing ticket reference"
[ "$#" -eq 1 ] || error "unexpected argument: $2"
reference=$1

activated_ticket=$(cr ticket activate "$reference" 2>&1)
if [ ! $? -eq 0 ]; then
    [ -n "$activated_ticket" ] || activated_ticket="unknown error"
    fatal "failed to activate ticket: $activated_ticket"
fi

delay_seconds=$(random_delay_seconds)
sleep "$delay_seconds"

if should_generate_error; then
    fatal "simulated error"
fi

closed_ticket=$(cr ticket close "$activated_ticket" done 2>&1)
if [ ! $? -eq 0 ]; then
    [ -n "$closed_ticket" ] || closed_ticket="unknown error"
    fatal "failed to close ticket: $closed_ticket"
fi

printf '%s\n' "$closed_ticket"
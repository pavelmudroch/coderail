#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

PROJECT_ROOT=$(
    CDPATH= cd -- "$SCRIPT_DIR/../.."
    pwd
)

TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-ticket-utils-test.XXXXXX")

. "$PROJECT_ROOT/test/suite.sh"
. "$PROJECT_ROOT/lib/utils/ticket.sh"

cleanup() {
    chmod -R u+w "$tmp_dir" 2>/dev/null || :
    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

fail() {
    echo "FAIL: $1" >&2
    exit 1
}

assert_file() {
    [ -f "$1" ] || fail "missing file: $1"
}

assert_path_missing() {
    [ ! -e "$1" ] || fail "path should not exist: $1"
}

assert_contains() {
    file=$1
    expected=$2

    grep -F "$expected" "$file" >/dev/null ||
        fail "$file does not contain: $expected"
}

assert_not_contains() {
    file=$1
    unexpected=$2

    ! grep -F "$unexpected" "$file" >/dev/null ||
        fail "$file contains: $unexpected"
}

assert_command_fails() {
    set +e
    "$@" >/dev/null 2>&1
    status=$?
    set -e

    [ "$status" -ne 0 ] || fail "command unexpectedly succeeded: $*"
}

create_project() {
    project_dir=$tmp_dir/project-$1

    mkdir -p "$project_dir/.coderail/tickets/open"
    mkdir -p "$project_dir/.coderail/tickets/active"
    mkdir -p "$project_dir/.coderail/tickets/closed"

    printf '%s\n' "$project_dir"
}

write_ticket() {
    ticket_file=$1
    ticket_id=$2
    ticket_slug=$3
    ticket_title=$4
    ticket_status=$5
    ticket_extra=$6

    cat > "$ticket_file" <<EOF
---
id: $ticket_id
slug: $ticket_slug
title: $ticket_title
status: $ticket_status
created_at: 2024-06-01T12:00:00Z
updated_at: 2024-06-01T12:00:00Z
dependencies: 0002
$ticket_extra---

# $ticket_title
EOF
}

assert_validate_open_ticket() {
    project_dir=$(create_project validate-open)
    ticket_file=$project_dir/.coderail/tickets/open/0001-first-ticket.md

    write_ticket "$ticket_file" 0001 first-ticket "First Ticket" open ""

    ticket_validate_file "$project_dir" "$ticket_file"
}

assert_validate_closed_duplicate_ticket() {
    project_dir=$(create_project validate-closed-duplicate)
    ticket_file=$project_dir/.coderail/tickets/closed/0002-duplicate-ticket.md

    write_ticket "$ticket_file" 0002 duplicate-ticket "Duplicate Ticket" closed "close_reason: duplicate
duplicate_of: 0001
"

    ticket_validate_file "$project_dir" "$ticket_file"
}

assert_reject_path_status_mismatch() {
    project_dir=$(create_project status-mismatch)
    ticket_file=$project_dir/.coderail/tickets/open/0003-mismatch.md

    write_ticket "$ticket_file" 0003 mismatch "Mismatch" active ""

    assert_command_fails ticket_validate_file "$project_dir" "$ticket_file"
}

assert_reject_open_close_reason() {
    project_dir=$(create_project open-close-reason)
    ticket_file=$project_dir/.coderail/tickets/open/0004-open-close-reason.md

    write_ticket "$ticket_file" 0004 open-close-reason "Open Close Reason" open "close_reason: done
"

    assert_command_fails ticket_validate_file "$project_dir" "$ticket_file"
}

assert_reject_duplicate_without_duplicate_of() {
    project_dir=$(create_project duplicate-missing-target)
    ticket_file=$project_dir/.coderail/tickets/closed/0005-duplicate-missing-target.md

    write_ticket "$ticket_file" 0005 duplicate-missing-target "Duplicate Missing Target" closed "close_reason: duplicate
"

    assert_command_fails ticket_validate_file "$project_dir" "$ticket_file"
}

assert_reject_zero_ticket_id() {
    project_dir=$(create_project zero-id)
    ticket_file=$project_dir/.coderail/tickets/open/0000-zero-id.md

    write_ticket "$ticket_file" 0000 zero-id "Zero ID" open ""

    assert_command_fails ticket_validate_file "$project_dir" "$ticket_file"
}

assert_move_to_open_removes_closed_fields() {
    project_dir=$(create_project move-open)
    ticket_file=$project_dir/.coderail/tickets/closed/0006-move-open.md

    write_ticket "$ticket_file" 0006 move-open "Move Open" closed "close_reason: duplicate
duplicate_of: 0001
"

    moved_path=$(ticket_move_to_state "$project_dir" "$ticket_file" open)
    moved_file=$project_dir/$moved_path

    [ "$moved_path" = ".coderail/tickets/open/0006-move-open.md" ] ||
        fail "unexpected moved path: $moved_path"
    assert_file "$moved_file"
    assert_path_missing "$ticket_file"
    assert_contains "$moved_file" "status: open"
    assert_contains "$moved_file" "dependencies: 0002"
    assert_not_contains "$moved_file" "close_reason:"
    assert_not_contains "$moved_file" "duplicate_of:"
    ticket_is_state "$moved_file" open
    ticket_validate_file "$project_dir" "$moved_file"
}

assert_move_does_not_full_validate_source() {
    project_dir=$(create_project move-partial)
    ticket_file=$project_dir/.coderail/tickets/closed/0007-partial.md

    cat > "$ticket_file" <<'EOF'
---
id: 0007
slug: partial
status: closed
updated_at: 2024-06-01T12:00:00Z
close_reason: done
---

# Partial
EOF

    moved_path=$(ticket_move_to_state "$project_dir" "$ticket_file" active)
    moved_file=$project_dir/$moved_path

    assert_file "$moved_file"
    assert_contains "$moved_file" "status: active"
    assert_not_contains "$moved_file" "close_reason:"
}

assert_ticket_is_state_requires_path_and_frontmatter() {
    project_dir=$(create_project is-state)
    ticket_file=$project_dir/.coderail/tickets/open/0008-is-state.md

    write_ticket "$ticket_file" 0008 is-state "Is State" open ""

    ticket_is_state "$ticket_file" open
    assert_command_fails ticket_is_state "$ticket_file" active

    status_mismatch=$project_dir/.coderail/tickets/active/0008-is-state.md
    cp "$ticket_file" "$status_mismatch"

    assert_command_fails ticket_is_state "$status_mismatch" active
}

assert_move_refuses_existing_target() {
    project_dir=$(create_project move-conflict)
    source_file=$project_dir/.coderail/tickets/closed/0009-conflict.md
    target_file=$project_dir/.coderail/tickets/open/0009-conflict.md

    write_ticket "$source_file" 0009 conflict "Conflict" closed "close_reason: done"
    write_ticket "$target_file" 0009 conflict "Conflict" open ""

    assert_command_fails ticket_move_to_state "$project_dir" "$source_file" open
    assert_file "$source_file"
    assert_file "$target_file"
}

print_tests_header "Ticket Utils Tests"
test "Validate open ticket" assert_validate_open_ticket
test "Validate closed duplicate ticket" assert_validate_closed_duplicate_ticket
test "Reject path/status mismatch" assert_reject_path_status_mismatch
test "Reject open close_reason" assert_reject_open_close_reason
test "Reject duplicate missing duplicate_of" assert_reject_duplicate_without_duplicate_of
test "Reject zero ticket id" assert_reject_zero_ticket_id
test "Move to open removes closed fields" assert_move_to_open_removes_closed_fields
test "Move does not full validate source" assert_move_does_not_full_validate_source
test "ticket_is_state checks path and frontmatter" assert_ticket_is_state_requires_path_and_frontmatter
test "Move refuses existing target" assert_move_refuses_existing_target

print_tests_summary

if some_tests_failed; then
    exit 1
fi

#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"
. "$PROJECT_ROOT/lib/utils/path.sh"

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' 0 HUP INT TERM

_expect_silent_failure()
{
    if output=$("$@" 2>&1); then
        return 1
    fi

    [ -z "$output" ]
}

print_tests_header "Path Utils Tests"

printf 'abc' > "$test_dir/checksum"
test_expect "checksum: known checksum and length" "1219131554 3" \
    path_checksum "$test_dir/checksum"

mkdir "$test_dir/directory"
mkfifo "$test_dir/fifo"
ln -s "$test_dir/checksum" "$test_dir/link"
chmod 000 "$test_dir/checksum"
test "checksum: rejects unreadable file" _expect_silent_failure path_checksum "$test_dir/checksum"
chmod 600 "$test_dir/checksum"
test "checksum: rejects directory" _expect_silent_failure path_checksum "$test_dir/directory"
test "checksum: rejects fifo" _expect_silent_failure path_checksum "$test_dir/fifo"
test "checksum: rejects symlink" _expect_silent_failure path_checksum "$test_dir/link"

mkdir "$test_dir/real-root"
ln -s "$test_dir/real-root" "$test_dir/root-link"
real_root=$(CDPATH= cd -P "$test_dir/real-root" && pwd)
test_expect "destination root: resolves missing components" "$real_root/new/child" \
    path_destination_root "$test_dir/real-root/new/child/"
test "destination root: rejects relative path" \
    _expect_silent_failure path_destination_root "real-root/new"
test "destination root: rejects link ancestor" \
    _expect_silent_failure path_destination_root "$test_dir/root-link/new"
test "destination root: rejects file ancestor" \
    _expect_silent_failure path_destination_root "$test_dir/checksum/new"

test "safe parent: accepts absent directories below root" \
    path_safe_parent "$test_dir/real-root/new/child" "$test_dir/real-root"
test "safe parent: rejects link ancestor" \
    _expect_silent_failure path_safe_parent "$test_dir/root-link/child" "$test_dir"
test "ensure directory: creates nested directories" \
    path_ensure_directory "$test_dir/real-root/new/child"
test "ensure directory: rejects link ancestor" \
    _expect_silent_failure path_ensure_directory "$test_dir/root-link/child"

print_tests_summary

if some_tests_failed; then
    exit 1
fi

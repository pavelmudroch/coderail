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

_manifest_relative_tab()
{
    path_manifest_relative "$(printf 'bin/a\tb')"
}

_manifest_relative_newline()
{
    path_manifest_relative "$(printf 'bin/a\nb')"
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

test_expect "manifest relative: accepts program path" "bin/cr" \
    path_manifest_relative "bin/cr"
test_expect "manifest relative: accepts protected path with spaces and metacharacters" \
    'templates/a file;$(keep)&[safe]' \
    path_manifest_relative 'templates/a file;$(keep)&[safe]'
test_expect "manifest relative: accepts nested library path" "lib/utils/path.sh" \
    path_manifest_relative "lib/utils/path.sh"

for unsafe_path in '' '.' '..' '/bin/cr' '../bin/cr' 'bin' 'bin/' './bin/cr' \
    'bin/./cr' 'bin/../cr' 'bin//cr' 'README.md' 'tests/path.test.sh'; do
    test "manifest relative: rejects $unsafe_path" \
        _expect_silent_failure path_manifest_relative "$unsafe_path"
done
test "manifest relative: rejects tab" _expect_silent_failure _manifest_relative_tab
test "manifest relative: rejects newline" _expect_silent_failure _manifest_relative_newline

test_expect "manifest target: joins below absolute root" "$test_dir/root/bin/cr" \
    path_manifest_target "$test_dir/root" "bin/cr"
test_expect "manifest target: joins paths with spaces and metacharacters" \
    "$test_dir/root/templates/a file;\$(keep)&[safe]" \
    path_manifest_target "$test_dir/root" 'templates/a file;$(keep)&[safe]'
test_expect "manifest target: joins below filesystem root" "/bin/cr" \
    path_manifest_target "/" "bin/cr"
test "manifest target: rejects relative root" \
    _expect_silent_failure path_manifest_target "relative-root" "bin/cr"
test "manifest target: rejects unsafe root" \
    _expect_silent_failure path_manifest_target "$test_dir/root/../other" "bin/cr"
test "manifest target: rejects unsafe relative path" \
    _expect_silent_failure path_manifest_target "$test_dir/root" "bin/../cr"

print_tests_summary

if some_tests_failed; then
    exit 1
fi

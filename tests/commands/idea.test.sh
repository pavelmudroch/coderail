#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
log_level=1

. "$PROJECT_ROOT/tests/suite.sh"
. "$PROJECT_ROOT/lib/utils/md.sh"
. "$PROJECT_ROOT/lib/utils/log.sh"
. "$PROJECT_ROOT/lib/commands/idea.sh"

_test_scan_tree_with_nested_ideas()
{
    test_dir=$(mktemp -d)
    trap 'rm -rf "$test_dir"' EXIT HUP INT TERM

    mkdir -p "$test_dir/.coderail/plans/alpha/child-a/grandchild" \
        "$test_dir/.coderail/plans/alpha/child-b" \
        "$test_dir/.coderail/plans/beta/child"
    printf -- '---\ntitle: Alpha\nstatus: split\n---\n' > "$test_dir/.coderail/plans/alpha/IDEA.md"
    printf -- '---\ntitle: Child A\nstatus: split\n---\n' > "$test_dir/.coderail/plans/alpha/child-a/IDEA.md"
    printf -- '---\ntitle: Grandchild\nstatus: ready\n---\n' > "$test_dir/.coderail/plans/alpha/child-a/grandchild/IDEA.md"
    printf -- '---\ntitle: Child B\nstatus: ready\n---\n' > "$test_dir/.coderail/plans/alpha/child-b/IDEA.md"
    printf -- '---\ntitle: Beta\nstatus: split\n---\n' > "$test_dir/.coderail/plans/beta/IDEA.md"
    printf -- '---\ntitle: Beta Child\nstatus: forging\n---\n' > "$test_dir/.coderail/plans/beta/child/IDEA.md"

    expected='alpha	.coderail/plans/alpha/IDEA.md	Alpha	split
alpha/child-a	.coderail/plans/alpha/child-a/IDEA.md	Child A	split	alpha
alpha/child-a/grandchild	.coderail/plans/alpha/child-a/grandchild/IDEA.md	Grandchild	ready	alpha/child-a
alpha/child-b	.coderail/plans/alpha/child-b/IDEA.md	Child B	ready	alpha
beta	.coderail/plans/beta/IDEA.md	Beta	split
beta/child	.coderail/plans/beta/child/IDEA.md	Beta Child	forging	beta'
    actual=$(cd "$test_dir" && _scan_tree)
    test_expect "$expected" "$actual"
}

_test_scan_tree_without_plans_directory()
{
    test_dir=$(mktemp -d)
    trap 'rm -rf "$test_dir"' EXIT HUP INT TERM

    actual=$(cd "$test_dir" && _scan_tree)
    test_expect "" "$actual"
}

_test_scan_tree_with_malformed_markdown()
{
    test_dir=$(mktemp -d)
    trap 'rm -rf "$test_dir"' EXIT HUP INT TERM

    mkdir -p "$test_dir/.coderail/plans/missing-start" \
        "$test_dir/.coderail/plans/missing-end" \
        "$test_dir/.coderail/plans/malformed-line"
    printf '# Missing front matter\n' > "$test_dir/.coderail/plans/missing-start/IDEA.md"
    printf -- '---\ntitle: Missing end\n' > "$test_dir/.coderail/plans/missing-end/IDEA.md"
    printf -- '---\ntitle: Malformed line\ninvalid\n---\n' > "$test_dir/.coderail/plans/malformed-line/IDEA.md"

    expected='malformed-line	.coderail/plans/malformed-line/IDEA.md
missing-end	.coderail/plans/missing-end/IDEA.md
missing-start	.coderail/plans/missing-start/IDEA.md			'
    actual=$(cd "$test_dir" && _scan_tree)
    test_expect "$expected" "$actual"
}

print_tests_header "Idea Command Tests"

test "scan tree with nested ideas" _test_scan_tree_with_nested_ideas
test "scan tree without plans directory" _test_scan_tree_without_plans_directory
test "scan tree with malformed markdown" _test_scan_tree_with_malformed_markdown

print_tests_summary

if some_tests_failed; then
    exit 1
fi

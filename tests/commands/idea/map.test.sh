#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' 0 HUP INT TERM
cd "$test_dir"

_run_idea_map()
{
    sh -eu -c '
        _CR_INSTALL_DIR=$1
        shift
        _CR_SUCCESS_EXIT_CODE=0
        _CR_ERROR_EXIT_CODE=1
        _CR_USAGE_EXIT_CODE=2
        EOL="
"
        log_level=1
        log_color=0
        log_interactive=0
        . "$_CR_INSTALL_DIR/lib/utils/log.sh"
        . "$_CR_INSTALL_DIR/lib/utils/fs.sh"
        . "$_CR_INSTALL_DIR/lib/utils/path.sh"
        . "$_CR_INSTALL_DIR/lib/utils/md.sh"
        reinit_log

        . "$_CR_INSTALL_DIR/lib/commands/idea.sh"
        execute_command map "$@"
    ' idea-map-test "$PROJECT_ROOT" "$@"
}

_write_test_idea()
{
    fixture_path=$1
    shift
    mkdir -p ".coderail/plans/$fixture_path"
    printf '%s\n' '---' "$@" '---' > ".coderail/plans/$fixture_path/IDEA.md"
}

_expect_map_failure()
{
    expected_status=$1
    expected_message=$2
    shift 2
    actual_status=0
    _run_idea_map "$@" > "$test_dir/stdout" 2> "$test_dir/stderr" || actual_status=$?
    [ "$actual_status" -eq "$expected_status" ] && [ ! -s "$test_dir/stdout" ] && \
        grep -Fq -- "$expected_message" "$test_dir/stderr" || return 1
    if [ "$expected_status" -eq 2 ]; then
        grep -Fq 'Usage:' "$test_dir/stderr"
    fi
}

print_tests_header "Idea Map Command Tests"

test_expect "map: missing plans directory" 'No ideas found' _run_idea_map
test "map: creates plans directory" test -d .coderail/plans
test_expect "map: empty directory with --json" 'No ideas found' _run_idea_map --json

# Create out of order; titles deliberately differ from directory sort order.
_write_test_idea zulu/child-b 'title: Child B' 'status: ready'
_write_test_idea zulu/child-a/two 'title: Two' 'status: forging'
_write_test_idea zulu/child-a/one 'title: One' 'status: forging'
_write_test_idea zulu/child-a 'title: Child A' 'status: split'
_write_test_idea zulu 'title: First title' 'status: split'
_write_test_idea alpha 'title: Last title' 'status: forging'
printf 'Specification\n' > .coderail/plans/zulu/child-b/SPEC.md
printf 'Keep these notes.\n' > .coderail/plans/alpha/notes.txt

test_expect "map: sorted nested tree, branches and mixed statuses" '/
├── Last title (forging): ".coderail/plans/alpha/IDEA.md"
└── First title (split): ".coderail/plans/zulu/IDEA.md"
    ├── Child A (split): ".coderail/plans/zulu/child-a/IDEA.md"
    │   ├── One (forging): ".coderail/plans/zulu/child-a/one/IDEA.md"
    │   └── Two (forging): ".coderail/plans/zulu/child-a/two/IDEA.md"
    └── Child B (ready): ".coderail/plans/zulu/child-b/IDEA.md"' _run_idea_map
test_expect "map: JSON fields, ordering and parent relationships" '[
  {
    "path": "alpha",
    "file": ".coderail/plans/alpha/IDEA.md",
    "title": "Last title",
    "status": "forging",
    "parent": null
  },
  {
    "path": "zulu",
    "file": ".coderail/plans/zulu/IDEA.md",
    "title": "First title",
    "status": "split",
    "parent": null
  },
  {
    "path": "zulu/child-a",
    "file": ".coderail/plans/zulu/child-a/IDEA.md",
    "title": "Child A",
    "status": "split",
    "parent": "zulu"
  },
  {
    "path": "zulu/child-a/one",
    "file": ".coderail/plans/zulu/child-a/one/IDEA.md",
    "title": "One",
    "status": "forging",
    "parent": "zulu/child-a"
  },
  {
    "path": "zulu/child-a/two",
    "file": ".coderail/plans/zulu/child-a/two/IDEA.md",
    "title": "Two",
    "status": "forging",
    "parent": "zulu/child-a"
  },
  {
    "path": "zulu/child-b",
    "file": ".coderail/plans/zulu/child-b/IDEA.md",
    "title": "Child B",
    "status": "ready",
    "parent": "zulu"
  }
]' _run_idea_map --json

for option in -h --help; do
    test "map: $option succeeds" _run_idea_map "$option"
done
test "map: rejects unknown option" _expect_map_failure 2 'Unknown option: --unknown' --unknown
test "map: rejects positional argument" _expect_map_failure 2 'Unknown argument: extra' extra
test "map: json rejects a value" _expect_map_failure 2 '--json does not take an argument' --json=yes
test "map: help rejects a value" _expect_map_failure 2 '--help does not take an argument' --help=yes

# A bad idea sorts after the valid tree: neither format should print partial output.
mkdir .coderail/plans/zz-invalid
for format in plain json; do
    if [ "$format" = json ]; then
        set -- --json
    else
        set --
    fi
    test "map: missing idea file suppresses partial $format output" _expect_map_failure 1 \
        'Invalid idea at .coderail/plans/zz-invalid: Failed to read idea file: File does not exist' "$@"
done
_write_test_idea zz-invalid 'title: Invalid' 'malformed'
test "map: rejects malformed front matter" _expect_map_failure 1 'Failed to read idea file: Invalid frontmatter:'
_write_test_idea zz-invalid 'status: forging'
test "map: rejects missing title" _expect_map_failure 1 'Missing title in front matter'
_write_test_idea zz-invalid 'title: Invalid'
test "map: rejects missing status" _expect_map_failure 1 'Missing status in front matter'
_write_test_idea zz-invalid 'title: Invalid' 'status: split'
test "map: rejects split with no children" _expect_map_failure 1 'Split idea must have at least two child ideas'
_write_test_idea zz-invalid/child 'title: Child' 'status: forging'
test "map: rejects split with one child" _expect_map_failure 1 'Split idea must have at least two child ideas'
_write_test_idea zz-invalid 'title: Invalid' 'status: forging'
test "map: rejects children of non-split idea" _expect_map_failure 1 'Non-split idea should not have child ideas'

mkdir "$test_dir/escaped"
cd "$test_dir/escaped"
_write_test_idea 'quoted "path"' 'title: A "quoted" title with \ backslash' 'status: forging'
test_expect "map: JSON escapes quotes and backslashes" '[
  {
    "path": "quoted \"path\"",
    "file": ".coderail/plans/quoted \"path\"/IDEA.md",
    "title": "A \"quoted\" title with \\ backslash",
    "status": "forging",
    "parent": null
  }
]' _run_idea_map --json

print_tests_summary

if some_tests_failed; then
    exit 1
fi

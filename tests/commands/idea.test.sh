#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
log_level=1

. "$PROJECT_ROOT/tests/suite.sh"
. "$PROJECT_ROOT/lib/utils/md.sh"
. "$PROJECT_ROOT/lib/utils/log.sh"
. "$PROJECT_ROOT/lib/commands/idea.sh"

test_root=$(mktemp -d)
trap 'rm -rf "$test_root"' EXIT HUP INT TERM

_test_idea_group()
{
    idea_group_function=$1
    shift
    test_expect "$1" '' _run_idea_test_group "$idea_group_function" "$@"
}

_run_idea_test_group()
{
    if sh "$PROJECT_ROOT/tests/commands/idea.test.sh" "$@" > "$test_root/group.log" 2>&1; then
        return 0
    fi
    cat "$test_root/group.log"
    return 1
}

_test_scan_tree_with_nested_ideas()
{
    idea_test_message=$1
    shift
    _setup_idea_test

    mkdir -p ".coderail/plans/alpha/child-a/grandchild" \
        ".coderail/plans/alpha/child-b" \
        ".coderail/plans/beta/child"
    printf -- '---\ntitle: Alpha\nstatus: split\n---\n' > ".coderail/plans/alpha/IDEA.md"
    printf -- '---\ntitle: Child A\nstatus: split\n---\n' > ".coderail/plans/alpha/child-a/IDEA.md"
    printf -- '---\ntitle: Grandchild\nstatus: ready\n---\n' > ".coderail/plans/alpha/child-a/grandchild/IDEA.md"
    printf -- '---\ntitle: Child B\nstatus: ready\n---\n' > ".coderail/plans/alpha/child-b/IDEA.md"
    printf -- '---\ntitle: Beta\nstatus: split\n---\n' > ".coderail/plans/beta/IDEA.md"
    printf -- '---\ntitle: Beta Child\nstatus: forging\n---\n' > ".coderail/plans/beta/child/IDEA.md"

    expected='.coderail/plans/alpha
.coderail/plans/alpha/child-a
.coderail/plans/alpha/child-a/grandchild
.coderail/plans/alpha/child-b
.coderail/plans/beta
.coderail/plans/beta/child'
    test_expect "$idea_test_message" "$expected" _scan_tree
}

_test_scan_tree_without_plans_directory()
{
    idea_test_message=$1
    shift
    _setup_idea_test

    test_expect "$idea_test_message" "" _scan_tree
}

_test_scan_tree_with_malformed_markdown()
{
    idea_test_message=$1
    shift
    _setup_idea_test

    mkdir -p ".coderail/plans/missing-start" \
        ".coderail/plans/missing-end" \
        ".coderail/plans/malformed-line"
    printf '# Missing front matter\n' > ".coderail/plans/missing-start/IDEA.md"
    printf -- '---\ntitle: Missing end\n' > ".coderail/plans/missing-end/IDEA.md"
    printf -- '---\ntitle: Malformed line\ninvalid\n---\n' > ".coderail/plans/malformed-line/IDEA.md"

    expected='.coderail/plans/malformed-line
.coderail/plans/missing-end
.coderail/plans/missing-start'
    test_expect "$idea_test_message" "$expected" _scan_tree
}

# Each test owns its workspace; each command runs with errexit in a fresh shell.
# Calling a sourced command inside the suite's conditional would disable errexit.
_setup_idea_test()
{
    test_dir=$(mktemp -d "$test_root/idea.XXXXXX")
    mkdir "$test_dir/work space"
    cd "$test_dir/work space"
}

_run_idea()
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
        . "$_CR_INSTALL_DIR/lib/utils/text.sh"
        reinit_log

        _CR_TEMP_RESOURCE_FILE="$PWD/resources"
        : > "$_CR_TEMP_RESOURCE_FILE"
        register_temp_resource()
        {
            printf "%s\n" "$1" >> "$_CR_TEMP_RESOURCE_FILE"
        }
        cleanup()
        {
            command_status=$?
            trap - 0 HUP INT TERM
            while IFS= read -r resource; do
                rm -rf "$resource"
            done < "$_CR_TEMP_RESOURCE_FILE"
            rm -f "$_CR_TEMP_RESOURCE_FILE"
            exit "$command_status"
        }
        trap cleanup 0
        trap "exit 129" HUP
        trap "exit 130" INT
        trap "exit 143" TERM

        . "$_CR_INSTALL_DIR/lib/commands/idea.sh"
        execute_command "$@"
    ' idea-test "$PROJECT_ROOT" "$@"
}

_expect_idea_command()
{
    expected_status=$1
    expected_stdout=$2
    expected_error=$3
    shift 3

    actual_status=0
    _run_idea "$@" > "$test_dir/stdout" 2> "$test_dir/stderr" || actual_status=$?
    test_expect "$idea_test_message: idea $* exit status" "$expected_status" printf '%s' "$actual_status"
    test_expect "$idea_test_message: idea $* stdout" "$expected_stdout" cat "$test_dir/stdout"

    if [ -z "$expected_error" ]; then
        test_expect "$idea_test_message: idea $* stderr" '' cat "$test_dir/stderr"
    else
        test_expect "$idea_test_message: idea $* error" '' grep -Fq "error: $expected_error" "$test_dir/stderr"
    fi
    if [ "$expected_status" -eq 2 ]; then
        test_expect "$idea_test_message: idea $* usage" '' grep -Fq 'Usage:' "$test_dir/stderr"
    fi

    # Registered staging directories must not leak into subsequent map commands.
    test_expect "$idea_test_message: no staging directories" '' find . -name '.cr-tmp-*'
}

_write_idea_fixture()
{
    fixture_path=$1
    shift
    mkdir -p ".coderail/plans/$fixture_path"
    printf '%s\n' '---' "$@" '---' > ".coderail/plans/$fixture_path/IDEA.md"
}

_expect_idea_file()
{
    test_expect "$idea_test_message: $1 contents" "---
title: $2
status: $3
---" cat ".coderail/plans/$1/IDEA.md"
}

_test_idea_create()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    _expect_idea_command 0 '.coderail/plans/hello-world/IDEA.md' '' create 'Hello, World!'
    _expect_idea_file hello-world 'Hello, World!' forging
    test_expect "$idea_test_message: contents" '.coderail/plans/hello-world/IDEA.md' find .coderail/plans -type f
}

_test_idea_lifecycle()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    _expect_idea_command 0 '.coderail/plans/parent/IDEA.md' '' create Parent
    printf '\n# Context\nKeep this body.\n' >> .coderail/plans/parent/IDEA.md
    printf 'Keep this attachment.\n' > .coderail/plans/parent/notes.txt
    for transition in ready reforge; do
        next_status=ready
        [ "$transition" != reforge ] || next_status=forging
        _expect_idea_command 0 "\".coderail/plans/parent/IDEA.md\" $next_status" '' \
            "$transition" .coderail/plans/parent/IDEA.md
        test_expect "$idea_test_message: contents" "---
title: Parent
status: $next_status
---

# Context
Keep this body." cat .coderail/plans/parent/IDEA.md
    done
    _expect_idea_command 0 '".coderail/plans/parent/IDEA.md" split into ".coderail/plans/parent/child-a/IDEA.md", ".coderail/plans/parent/child-b/IDEA.md"' '' \
        split parent 'Child A' 'Child B'
    test_expect "$idea_test_message: contents" '---
title: Parent
status: split
---

# Context
Keep this body.' cat .coderail/plans/parent/IDEA.md
    _expect_idea_file parent/child-a 'Child A' forging
    _expect_idea_file parent/child-b 'Child B' forging
    test_expect "$idea_test_message: contents" 'Keep this attachment.' cat .coderail/plans/parent/notes.txt
    _expect_idea_command 0 '".coderail/plans/parent/child-a/IDEA.md" ready' '' ready parent/child-a
    _expect_idea_file parent/child-a 'Child A' ready
}

_test_idea_create_child()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    _write_idea_fixture parent 'title: Parent' 'status: split'
    _write_idea_fixture parent/a 'title: A' 'status: forging'
    _write_idea_fixture parent/b 'title: B' 'status: ready'
    _expect_idea_command 0 '.coderail/plans/parent/child-c/IDEA.md' '' create "$@" 'Child C'
    _expect_idea_file parent/child-c 'Child C' forging
    _expect_idea_file parent Parent split
    _expect_idea_file parent/a A forging
    _expect_idea_file parent/b B ready
}

_test_idea_duplicate()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    _write_idea_fixture hello-world 'title: Original title' 'status: ready'
    cp .coderail/plans/hello-world/IDEA.md "$test_dir/before"
    _expect_idea_command 1 '' 'Idea already exists at path: ".coderail/plans/hello-world/IDEA.md"' \
        create 'Hello, World!'
    test_expect "$idea_test_message: original idea preserved" '' cmp "$test_dir/before" .coderail/plans/hello-world/IDEA.md
}

_test_idea_usage_error()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    _expect_idea_command 2 '' "$@"
    test_expect "$idea_test_message: no ideas created" '' find . -name IDEA.md
}

_test_idea_help()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    help_command=$1
    shift
    actual_status=0
    _run_idea "$@" > "$test_dir/stdout" 2> "$test_dir/stderr" || actual_status=$?
    test_expect "$idea_test_message: exit status" 0 printf '%s' "$actual_status"
    test_expect "$idea_test_message: usage heading" '' grep -Fxq 'Usage:' "$test_dir/stdout"
    test_expect "$idea_test_message: usage command" '' grep -q "^  cr idea$help_command " "$test_dir/stdout"
    test_expect "$idea_test_message: stderr" '' cat "$test_dir/stderr"
    test_expect "$idea_test_message: no ideas created" '' find . -name IDEA.md
}

_test_idea_invalid_status()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    fixture_status=$1
    shift
    _write_idea_fixture parent 'title: Parent' "status: $fixture_status"
    cp .coderail/plans/parent/IDEA.md "$test_dir/before"
    _expect_idea_command 1 '' "$@"
    test_expect "$idea_test_message: original idea preserved" '' cmp "$test_dir/before" .coderail/plans/parent/IDEA.md
    test_expect "$idea_test_message: contents" '.coderail/plans/parent/IDEA.md' find .coderail/plans -type f
}

_test_idea_path_error()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    _expect_idea_command 1 '' "$@"
    test_expect "$idea_test_message: no ideas created" '' find . -name IDEA.md
}

_test_idea_normalized_path()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    _write_idea_fixture parent 'title: Parent' 'status: forging'
    _expect_idea_command 0 '".coderail/plans/parent/IDEA.md" ready' '' ready "$1"
    _expect_idea_file parent Parent ready
}

_test_idea_option_terminator()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    _expect_idea_command 0 '.coderail/plans/option-title/IDEA.md' '' create -- '--Option title'
    _expect_idea_file option-title '--Option title' forging
    _write_idea_fixture -parent 'title: Parent' 'status: forging'
    _expect_idea_command 0 '".coderail/plans/-parent/IDEA.md" ready' '' ready -- -parent
    _expect_idea_command 0 '".coderail/plans/-parent/IDEA.md" forging' '' reforge -- -parent
    _expect_idea_command 0 '".coderail/plans/-parent/IDEA.md" split into ".coderail/plans/-parent/first/IDEA.md", ".coderail/plans/-parent/second/IDEA.md", ".coderail/plans/-parent/third/IDEA.md"' '' \
        split -- -parent --First --Second --Third
    _expect_idea_file -parent Parent split
    _expect_idea_file -parent/first --First forging
    _expect_idea_file -parent/second --Second forging
    _expect_idea_file -parent/third --Third forging
}

_test_idea_malformed_file()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    malformed_content=$1
    shift
    mkdir -p .coderail/plans/parent
    printf '%s\n' "$malformed_content" > .coderail/plans/parent/IDEA.md
    cp .coderail/plans/parent/IDEA.md "$test_dir/before"
    _expect_idea_command 1 '' "$@"
    test_expect "$idea_test_message: original idea preserved" '' cmp "$test_dir/before" .coderail/plans/parent/IDEA.md
}

_test_idea_create_blocked_path()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    mkdir -p .coderail/plans
    printf 'Keep this file.\n' > .coderail/plans/blocked
    _expect_idea_command 1 '' 'Cannot write to ".coderail/plans/blocked"' create Blocked
    test_expect "$idea_test_message: contents" 'Keep this file.' cat .coderail/plans/blocked
}

_test_idea_create_existing_directory()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    mkdir -p .coderail/plans/existing
    printf 'Keep this attachment.\n' > .coderail/plans/existing/notes.txt
    _expect_idea_command 0 '.coderail/plans/existing/IDEA.md' '' create Existing
    _expect_idea_file existing Existing forging
    test_expect "$idea_test_message: contents" 'Keep this attachment.' cat .coderail/plans/existing/notes.txt
}

_test_idea_plans_blocked_path()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    mkdir .coderail
    printf 'Keep this file.\n' > .coderail/plans
    _expect_idea_command 1 '' 'Failed to create ".coderail/plans" directory' map
    test_expect "$idea_test_message: contents" 'Keep this file.' cat .coderail/plans
}

_test_idea_split_rollback()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    _write_idea_fixture parent 'title: Parent' 'status: forging'
    # The second child's path is occupied, after the first child was staged.
    printf 'Keep this file.\n' > .coderail/plans/parent/blocked
    cp .coderail/plans/parent/IDEA.md "$test_dir/before"
    # This failure currently exits without a diagnostic; only require rollback.
    actual_status=0
    _run_idea split parent First Blocked > "$test_dir/stdout" 2> "$test_dir/stderr" || actual_status=$?
    test_expect "$idea_test_message: exit status" 1 printf '%s' "$actual_status"
    test_expect "$idea_test_message: stdout" '' cat "$test_dir/stdout"
    test_expect "$idea_test_message: no staging directories" '' find . -name '.cr-tmp-*'
    test_expect "$idea_test_message: original idea preserved" '' cmp "$test_dir/before" .coderail/plans/parent/IDEA.md
    test_expect_fail "$idea_test_message: first child removed" '' [ -e .coderail/plans/parent/first ]
    test_expect "$idea_test_message: contents" 'Keep this file.' cat .coderail/plans/parent/blocked
}

_test_idea_map_empty()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    _expect_idea_command 0 'No ideas found' '' map "$@"
    test_expect "$idea_test_message: plans directory created" '' [ -d .coderail/plans ]
}

_test_idea_map()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    # Create out of order to check sorting, nested parent paths and tree branches.
    _expect_idea_command 0 '.coderail/plans/zulu/IDEA.md' '' create Zulu
    _expect_idea_command 0 '.coderail/plans/alpha/IDEA.md' '' create Alpha
    _expect_idea_command 0 '".coderail/plans/alpha/IDEA.md" split into ".coderail/plans/alpha/child-a/IDEA.md", ".coderail/plans/alpha/child-b/IDEA.md"' '' \
        split alpha 'Child A' 'Child B'
    _expect_idea_command 0 '".coderail/plans/alpha/child-a/IDEA.md" split into ".coderail/plans/alpha/child-a/one/IDEA.md", ".coderail/plans/alpha/child-a/two/IDEA.md"' '' \
        split alpha/child-a One Two
    _expect_idea_command 0 '".coderail/plans/alpha/child-b/IDEA.md" ready' '' ready alpha/child-b
    printf 'Specification\n' > .coderail/plans/alpha/child-b/SPEC.md

    if [ "$1" = plain ]; then
        _expect_idea_command 0 '/
├── Alpha (split): ".coderail/plans/alpha/IDEA.md"
│   ├── Child A (split): ".coderail/plans/alpha/child-a/IDEA.md"
│   │   ├── One (forging): ".coderail/plans/alpha/child-a/one/IDEA.md"
│   │   └── Two (forging): ".coderail/plans/alpha/child-a/two/IDEA.md"
│   └── Child B (ready): ".coderail/plans/alpha/child-b/IDEA.md"
└── Zulu (forging): ".coderail/plans/zulu/IDEA.md"' '' map
    else
        _expect_idea_command 0 '[
  {
    "path": "alpha",
    "file": ".coderail/plans/alpha/IDEA.md",
    "title": "Alpha",
    "status": "split",
    "parent": null
  },
  {
    "path": "alpha/child-a",
    "file": ".coderail/plans/alpha/child-a/IDEA.md",
    "title": "Child A",
    "status": "split",
    "parent": "alpha"
  },
  {
    "path": "alpha/child-a/one",
    "file": ".coderail/plans/alpha/child-a/one/IDEA.md",
    "title": "One",
    "status": "forging",
    "parent": "alpha/child-a"
  },
  {
    "path": "alpha/child-a/two",
    "file": ".coderail/plans/alpha/child-a/two/IDEA.md",
    "title": "Two",
    "status": "forging",
    "parent": "alpha/child-a"
  },
  {
    "path": "alpha/child-b",
    "file": ".coderail/plans/alpha/child-b/IDEA.md",
    "title": "Child B",
    "status": "ready",
    "parent": "alpha"
  },
  {
    "path": "zulu",
    "file": ".coderail/plans/zulu/IDEA.md",
    "title": "Zulu",
    "status": "forging",
    "parent": null
  }
]' '' map --json
    fi
}

_test_idea_map_invalid()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    expected_validation=$1
    shift
    _write_idea_fixture parent "$@"
    _expect_idea_command 1 '' "Invalid idea at .coderail/plans/parent: $expected_validation" map
}

_test_idea_map_invalid_children()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    _write_idea_fixture parent 'title: Parent' "status: $1"
    _write_idea_fixture parent/child 'title: Child' 'status: forging'
    _expect_idea_command 1 '' "Invalid idea at .coderail/plans/parent: $2" map
}

_test_idea_map_missing_file()
{
    idea_test_message=$1
    shift
    _setup_idea_test
    mkdir -p .coderail/plans/parent
    _expect_idea_command 1 '' 'Invalid idea at .coderail/plans/parent: Failed to read idea file: File does not exist' map
}

# Run each group in a fresh shell to isolate suite results and preserve errexit.
if [ "$#" -gt 0 ]; then
    "$@"
    if some_tests_failed; then
        exit 1
    fi
    exit 0
fi

print_tests_header "Idea Command Tests"

_test_idea_group _test_scan_tree_with_nested_ideas "scan tree with nested ideas"
_test_idea_group _test_scan_tree_without_plans_directory "scan tree without plans directory"
_test_idea_group _test_scan_tree_with_malformed_markdown "scan tree with malformed markdown"

_test_idea_group _test_idea_create "create: slug and initial file contents"
_test_idea_group _test_idea_lifecycle "create, ready, reforge, split and ready child lifecycle"
for parent_option in -p --parent; do
    _test_idea_group _test_idea_create_child "create: child with $parent_option" "$parent_option" .coderail/plans/parent/IDEA.md
done
_test_idea_group _test_idea_create_child "create: child with --parent=value" --parent=parent
_test_idea_group _test_idea_duplicate "create: duplicate slug preserves original idea"
_test_idea_group _test_idea_create_blocked_path "create: occupied destination preserves file"
_test_idea_group _test_idea_create_existing_directory "create: existing directory preserves attachments"
_test_idea_group _test_idea_split_rollback "split: failure rolls back staged children and parent status"
_test_idea_group _test_idea_plans_blocked_path "map: plans path occupied by file"
_test_idea_group _test_idea_option_terminator "commands: -- allows arguments beginning with hyphens"

for help_option in -h --help; do
    _test_idea_group _test_idea_help "idea: $help_option" '' "$help_option"
    for subcommand in create ready reforge split map; do
        _test_idea_group _test_idea_help "$subcommand: $help_option" " $subcommand" "$subcommand" "$help_option"
    done
done

_test_idea_group _test_idea_usage_error "idea: unknown argument" 'Unknown argument: unknown' unknown
_test_idea_group _test_idea_usage_error "idea: unknown option" 'Unknown option: --unknown' --unknown
_test_idea_group _test_idea_usage_error "idea: help rejects a value" '--help does not take an argument' --help=yes
for subcommand in create ready reforge split map; do
    _test_idea_group _test_idea_usage_error "$subcommand: unknown option" 'Unknown option: --unknown' "$subcommand" --unknown
    _test_idea_group _test_idea_usage_error "$subcommand: help rejects a value" '--help does not take an argument' "$subcommand" --help=yes
done
_test_idea_group _test_idea_usage_error "create: missing title" 'Exactly one idea title must be provided' create
_test_idea_group _test_idea_usage_error "create: multiple titles" 'Multiple idea titles provided' create One Two
_test_idea_group _test_idea_usage_error "create: empty parent option" 'Missing argument for --parent option' create --parent= Child
_test_idea_group _test_idea_usage_error "create: empty parent argument" 'Missing argument for --parent option' create -p '' Child
for subcommand in ready reforge; do
    _test_idea_group _test_idea_usage_error "$subcommand: missing path" 'Exactly one idea path must be provided' "$subcommand"
    _test_idea_group _test_idea_usage_error "$subcommand: multiple paths" 'Exactly one idea path must be provided' "$subcommand" One Two
done
_test_idea_group _test_idea_usage_error "split: missing path" 'Idea path is required' split
_test_idea_group _test_idea_usage_error "split: missing children" 'At least two child titles are required' split parent
_test_idea_group _test_idea_usage_error "split: only one child" 'At least two child titles are required' split parent Child
_test_idea_group _test_idea_usage_error "map: unexpected argument" 'Unknown argument: extra' map extra
_test_idea_group _test_idea_usage_error "map: json rejects a value" '--json does not take an argument' map --json=yes

for fixture_status in ready split unknown ''; do
    _test_idea_group _test_idea_invalid_status "ready: rejects status '$fixture_status'" "$fixture_status" \
        'Only forging ideas can be marked as ready:' ready parent
    _test_idea_group _test_idea_invalid_status "split: rejects status '$fixture_status'" "$fixture_status" \
        'Only forging ideas can be marked as split:' split parent One Two
done
for fixture_status in forging split unknown ''; do
    _test_idea_group _test_idea_invalid_status "reforge: rejects status '$fixture_status'" "$fixture_status" \
        'Only ready ideas can be reforged:' reforge parent
done
for fixture_status in forging ready unknown ''; do
    _test_idea_group _test_idea_invalid_status "create: rejects parent status '$fixture_status'" "$fixture_status" \
        "Parent idea must be in 'split' status" create --parent parent Child
done

for idea_path in /absolute ../outside parent/../../outside ''; do
    for subcommand in ready reforge; do
        _test_idea_group _test_idea_path_error "$subcommand: rejects path '$idea_path'" 'Invalid idea path:' "$subcommand" "$idea_path"
    done
    if [ -n "$idea_path" ]; then
        _test_idea_group _test_idea_path_error "split: rejects path '$idea_path'" 'Invalid idea path:' split "$idea_path" One Two
        _test_idea_group _test_idea_path_error "create: rejects parent '$idea_path'" 'Invalid parent idea path:' create --parent "$idea_path" Child
    fi
done
for idea_path in parent parent/IDEA.md .coderail/plans/parent .coderail/plans/parent/IDEA.md ./parent/ parent//./child/..; do
    _test_idea_group _test_idea_normalized_path "ready: normalizes '$idea_path'" "$idea_path"
done
for subcommand in ready reforge; do
    _test_idea_group _test_idea_path_error "$subcommand: missing idea" 'Failed to read idea file: File does not exist' "$subcommand" missing
done
_test_idea_group _test_idea_path_error "split: missing idea" 'Failed to read idea file: File does not exist' split missing One Two
_test_idea_group _test_idea_path_error "create: missing parent" 'Failed to read parent idea file: File does not exist' create --parent missing Child

for malformed_content in '# No front matter' '---
title: Unterminated' '---
title: Malformed
invalid
---' '---
title: Duplicate
status: forging
status: ready
---'; do
    for subcommand in ready reforge; do
        _test_idea_group _test_idea_malformed_file "$subcommand: malformed front matter" "$malformed_content" \
            'Failed to read idea file: Invalid frontmatter:' "$subcommand" parent
    done
    _test_idea_group _test_idea_malformed_file "split: malformed front matter" "$malformed_content" \
        'Failed to read idea file: Invalid frontmatter:' split parent One Two
    _test_idea_group _test_idea_malformed_file "create: malformed parent front matter" "$malformed_content" \
        'Failed to read parent idea file: Invalid frontmatter:' create --parent parent Child
    _test_idea_group _test_idea_malformed_file "map: malformed front matter" "$malformed_content" \
        'Invalid idea at .coderail/plans/parent: Failed to read idea file: Invalid frontmatter:' map
done

_test_idea_group _test_idea_map_empty "map: empty workspace"
_test_idea_group _test_idea_map_empty "map: empty workspace with --json" --json
_test_idea_group _test_idea_map "map: sorted nested tree with mixed statuses" plain
_test_idea_group _test_idea_map "map: JSON paths, files, titles, statuses and parents" json
_test_idea_group _test_idea_map_missing_file "map: missing idea file"
_test_idea_group _test_idea_map_invalid "map: missing title" 'Missing title in front matter' 'status: forging'
_test_idea_group _test_idea_map_invalid "map: missing status" 'Missing status in front matter' 'title: Parent'
_test_idea_group _test_idea_map_invalid "map: split with no children" 'Split idea must have at least two child ideas' 'title: Parent' 'status: split'
_test_idea_group _test_idea_map_invalid_children "map: split with one child" split 'Split idea must have at least two child ideas'
for fixture_status in forging ready; do
    _test_idea_group _test_idea_map_invalid_children "map: $fixture_status with children" "$fixture_status" 'Non-split idea should not have child ideas'
done

print_tests_summary

if some_tests_failed; then
    exit 1
fi

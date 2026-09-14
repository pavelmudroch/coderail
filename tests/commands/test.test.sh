#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
. "$PROJECT_ROOT/tests/suite.sh"

test_root=$(mktemp -d)
trap 'rm -rf "$test_root"' 0
trap 'exit 1' HUP INT TERM
mkdir -p "$test_root/.coderail"
cd "$test_root"

_run_test()
{
    sh -eu -c '
        _CR_SUCCESS_EXIT_CODE=0
        _CR_ERROR_EXIT_CODE=1
        _CR_USAGE_EXIT_CODE=2
        EOL="
"
        output() { printf "%s\n" "$*"; }
        log_error() { printf "%s\n" "$*" >&2; }
        . "$1/lib/utils/path.sh"
        . "$1/lib/commands/test.sh"
        shift
        execute_command "$@"
    ' test-command "$PROJECT_ROOT" "$@"
}

print_tests_header 'Test Command Tests'
test_expect 'missing map' 'No tests found' _run_test missing
: > .coderail/test_map
test_expect 'empty map' 'No tests found' _run_test missing

cat > .coderail/test_map <<'MAP'
# Comment
[src/${path}/${file}.ts]
printf '%s\n' '${path}/${file}'
printf '%s\n' shared
[src/*]
printf '%s\n' shared
printf '%s\n' wildcard
[other/?.ts]
printf '%s\n' other
MAP
test_expect 'captures, overlapping patterns, order and deduplication' 'deep/nested/one
shared
wildcard
deep/nested/two
other' _run_test src/deep/nested/one.ts src/deep/nested/two.ts src/deep/nested/one.ts other/a.ts
test_expect 'whole path matching' 'No tests found' _run_test prefix/src/a/b.ts other/ab.ts
mkdir -p 'src/space dir'
: > 'src/space dir/file name.ts'
test_expect 'directory selection and spaces' 'space dir/file name
shared
wildcard' _run_test ./src/

for selector in 'src//space dir/../space dir/./file name.ts' "$PWD/src/space dir/file name.ts" . "$PWD"; do
    test_expect "normalize selector: $selector" 'space dir/file name
shared
wildcard' _run_test "$selector"
done

for selector in ../outside src/../../outside "$PWD/../outside" /outside; do
    expected_path=$selector
    case "$expected_path" in
        "$PWD"/*) expected_path=${expected_path#"$PWD"/} ;;
    esac
    test_expect_fail "reject escaping selector: $selector" "Invalid test path: $expected_path
Failed to list files for testing" _run_test 'src/space dir/file name.ts' "$selector"
done

cat > .coderail/test_map <<'MAP'
[${name}/${name}.sh]
printf '%s\n' '${name}'
[${file}.sh]
printf '%s\n' '${file}' "${CR_TEST_ENV}"
MAP
CR_TEST_ENV=environment
export CR_TEST_ENV
test_expect 'repeated captures and shell variables' 'abc
abc/abc
environment
abc/def
environment' _run_test abc/abc.sh abc/def.sh
test_expect 'capture values are substituted literally' 'a&b\c
environment' _run_test 'a&b\c.sh'

cat > .coderail/test_map <<'MAP'
[*]
printf '%s\n' first
exit 7
printf '%s\n' last
MAP
test_expect_fail 'failure does not stop later commands' 'first
last' _run_test any

cat > .coderail/test_map <<'MAP'
[${file}.ts]
printf '%s\n' 'check:${file}'; test '${file}' != bad
printf '%s\n' 'after:${file}'
printf '%s\n' shared; exit 3
printf '%s\n' "${CR_TEST_ENV}"
[${file}.ts]
printf '%s\n' 'last:${file}'
MAP
test_expect_fail 'stop only failed file across sections; shared failures stay independent' 'check:bad
shared
environment
check:good
after:good
last:good' _run_test bad.ts good.ts

cat > .coderail/test_map <<'MAP'
[${path}/${file}.ts]
printf '%s\n' 'check:${path}'; test '${path}' != bad
printf '%s\n' 'after:${path}/${file}'
MAP
test_expect_fail 'cached failures stop each dependent file; cached successes allow continuation' 'check:bad
check:good
after:good/one
after:good/two' _run_test bad/one.ts bad/two.ts good/one.ts good/two.ts

cat > .coderail/test_map <<'MAP'
[${path}/${file}.ts]
printf '%s\n' 'check:${file}'; test '${file}' != bad
printf '%s\n' 'later:${path}'
MAP
test_expect_fail 'skipped commands remain available for other files' 'check:bad
check:good
later:group' _run_test group/bad.ts group/good.ts

cat > .coderail/test_map <<'MAP'
[${file}.ts]
printf '%s\n' '${file}'; exit 1
printf '%s\n' 'failed'; exit 1
printf '%s\n' 'after:${file}'
printf '%s\n' final
MAP
test_expect_fail 'same expanded command shares result across per-file and shared uses' 'failed
final
other' _run_test failed.ts other.ts

cat > .coderail/test_map <<'MAP'
[*]
cat > consumed
printf '%s\n' finished
MAP
test_expect 'commands cannot consume the command queue' finished _run_test any

printf '%s\n' 'printf unexpected' > .coderail/test_map
test_expect_fail 'reject command without pattern before running anything' 'Failed to collect test commands' _run_test any

cat > .coderail/test_map <<'MAP'
[${file}.ts]
printf '%s\n' '${file}'
MAP
git init -q
: > staged.ts
git add staged.ts
test_expect 'changed files before first commit' 'staged
src/space dir/file name' _run_test --changed
git -c commit.gpgsign=false -c user.name=Test -c user.email=test@example.com commit -qm initial
printf changed > staged.ts
: > added.ts
git add added.ts
: > untracked.ts
test_expect 'staged, unstaged and untracked files with explicit deduplication' 'added
staged
src/space dir/file name
untracked' _run_test added.ts --changed

_usage_status()
{
    result=0
    _run_test "$@" > /dev/null 2>&1 || result=$?
    printf '%s' "$result"
}
test_expect 'missing selector' 2 _usage_status
test_expect 'unknown option' 2 _usage_status --invalid
test_expect 'help' 0 _usage_status --help
test_expect 'changed rejects value' 2 _usage_status --changed=yes

print_tests_summary
if some_tests_failed; then
    exit 1
fi

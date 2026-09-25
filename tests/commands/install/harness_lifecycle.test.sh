#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"
. "$PROJECT_ROOT/lib/utils/path.sh"
. "$PROJECT_ROOT/lib/commands/install/harness_lifecycle.sh"

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' 0 HUP INT TERM

_expect_failure()
{
    if "$@" >/dev/null 2>&1; then
        return 1
    fi
    return 0
}

_read_valid_manifest()
{
    harness_manifest_read "$test_dir/home" codex "$test_dir/records"
    cat "$test_dir/records"
}

_read_rejected_manifest()
{
    _expect_failure harness_manifest_read "$test_dir/home" codex "$test_dir/records"
}

print_tests_header "Harness Lifecycle Manifest Tests"

mkdir "$test_dir/home"
printf 'skills/build/SKILL.md\t3\t4\nAGENTS.md\t1\t2\n' > "$test_dir/input"
test "manifest: writes and reads sorted snapshot" harness_manifest_write "$test_dir/home" codex "$test_dir/input"
test_expect "manifest: sorted records" "AGENTS.md	1	2
skills/build/SKILL.md	3	4" _read_valid_manifest

for malformed in \
    'coderail-harness-manifest\t1\tclaude\n' \
    'coderail-harness-manifest\t2\tcodex\n' \
    'coderail-harness-manifest\t1\tcodex\nAGENTS.md\t1\t2' \
    'coderail-harness-manifest\t1\tcodex\nAGENTS.md\t1\t2\textra\n' \
    'coderail-harness-manifest\t1\tcodex\nAGENTS.md\tone\t2\n' \
    'coderail-harness-manifest\t1\tcodex\nskills/build/SKILL.md\t1\t2\nAGENTS.md\t1\t2\n' \
    'coderail-harness-manifest\t1\tcodex\nAGENTS.md\t1\t2\nAGENTS.md\t3\t4\n' \
    'coderail-harness-manifest\t1\tcodex\n.coderail/harnesses/codex.manifest\t1\t2\n'; do
    rm -rf "$test_dir/home/.coderail"
    printf '%b' "$malformed" > "$test_dir/home/.manifest"
    mkdir -p "$test_dir/home/.coderail/harnesses"
    mv "$test_dir/home/.manifest" "$test_dir/home/.coderail/harnesses/codex.manifest"
    test "manifest: rejects malformed record" _read_rejected_manifest
done

rm -rf "$test_dir/home/.coderail"
ln -s "$test_dir/input" "$test_dir/home/.coderail"
test "manifest: rejects linked metadata" _read_rejected_manifest
rm "$test_dir/home/.coderail"
mkdir -p "$test_dir/home/.coderail/harnesses"
ln -s "$test_dir/input" "$test_dir/home/.coderail/harnesses/codex.manifest"
test "manifest: rejects linked manifest" _read_rejected_manifest
rm -rf "$test_dir/home/.coderail"
printf 'metadata\n' > "$test_dir/home/.coderail"
test "manifest: refuses nonmanifest metadata" _expect_failure harness_manifest_write "$test_dir/home" codex "$test_dir/input"
rm "$test_dir/home/.coderail"
mkdir -p "$test_dir/home/.coderail/harnesses/codex.manifest"
test "manifest: rejects wrong-type manifest" _read_rejected_manifest

print_tests_summary

if some_tests_failed; then
    exit 1
fi

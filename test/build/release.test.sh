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
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-release-test.XXXXXX")

. "$PROJECT_ROOT/test/suite.sh"

cleanup() {
    chmod -R u+rwX "$tmp_dir" 2>/dev/null || :
    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

fail() {
    echo "FAIL: $1" >&2
    exit 1
}

assert_success() {
    [ "$run_status" -eq 0 ] || fail "expected success, got status $run_status"
}

assert_failure() {
    [ "$run_status" -ne 0 ] || fail "expected failure"
}

assert_contains() {
    grep -F -- "$2" "$1" >/dev/null || fail "$1 does not contain: $2"
}

assert_stderr_contains() {
    assert_contains "$run_stderr" "$1"
}

assert_stdout_contains() {
    assert_contains "$run_stdout" "$1"
}

assert_tag_missing() {
    work_dir=$1
    tag=$2

    if git -C "$work_dir" rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
        fail "tag should not exist locally: $tag"
    fi
}

assert_remote_tag_missing() {
    work_dir=$1
    tag=$2

    if git -C "$work_dir" ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
        fail "tag should not exist on origin: $tag"
    fi
}

assert_annotated_tag() {
    work_dir=$1
    tag=$2
    expected_message=$3

    tag_type=$(git -C "$work_dir" cat-file -t "refs/tags/$tag" 2>/dev/null) ||
        fail "tag should exist locally: $tag"
    [ "$tag_type" = tag ] || fail "expected $tag to be annotated, got $tag_type"

    tag_message=$(git -C "$work_dir" for-each-ref --format='%(contents:subject)' "refs/tags/$tag")
    [ "$tag_message" = "$expected_message" ] ||
        fail "expected $tag message '$expected_message', got '$tag_message'"
}

assert_tag_ref() {
    work_dir=$1
    tag=$2
    expected_ref=$3

    actual_ref=$(git -C "$work_dir" rev-parse "refs/tags/$tag")
    [ "$actual_ref" = "$expected_ref" ] ||
        fail "expected $tag ref $expected_ref, got $actual_ref"
}

assert_tag_resolves_to_commit() {
    work_dir=$1
    tag=$2
    expected_commit=$3

    actual_commit=$(git -C "$work_dir" rev-parse "refs/tags/$tag^{}") ||
        fail "tag should exist locally: $tag"
    [ "$actual_commit" = "$expected_commit" ] ||
        fail "expected $tag to resolve to $expected_commit, got $actual_commit"
}

assert_remote_tag_ref() {
    work_dir=$1
    tag=$2
    expected_ref=$3
    remote_dir=$(git -C "$work_dir" remote get-url origin)

    actual_ref=$(git --git-dir="$remote_dir" rev-parse "refs/tags/$tag" 2>/dev/null) ||
        fail "tag should exist on origin: $tag"
    [ "$actual_ref" = "$expected_ref" ] ||
        fail "expected remote $tag ref $expected_ref, got $actual_ref"
}

assert_remote_tag_resolves_to_commit() {
    work_dir=$1
    tag=$2
    expected_commit=$3
    remote_dir=$(git -C "$work_dir" remote get-url origin)

    actual_commit=$(git --git-dir="$remote_dir" rev-parse "refs/tags/$tag^{}" 2>/dev/null) ||
        fail "tag should exist on origin: $tag"
    [ "$actual_commit" = "$expected_commit" ] ||
        fail "expected remote $tag to resolve to $expected_commit, got $actual_commit"
}

assert_release_published() {
    work_dir=$1
    version=$2
    tag=v$version
    release_commit=$(git -C "$work_dir" rev-parse HEAD)

    assert_annotated_tag "$work_dir" "$tag" "release version $version"
    assert_annotated_tag "$work_dir" latest "latest version pointer"
    assert_tag_resolves_to_commit "$work_dir" "$tag" "$release_commit"
    assert_tag_resolves_to_commit "$work_dir" latest "$release_commit"
    assert_remote_tag_resolves_to_commit "$work_dir" "$tag" "$release_commit"
    assert_remote_tag_resolves_to_commit "$work_dir" latest "$release_commit"
}

write_release_metadata() {
    work_dir=$1
    version=$2
    compare_previous_version=${3:-}
    tag=v$version

    mkdir -p "$work_dir/lib"
    printf 'coderail_version="%s"\n' "$version" > "$work_dir/lib/version.sh"
    {
        printf '# Changelog\n'
        printf '\n'
        printf '## [Unreleased]\n'
        printf '\n'
        printf '## [%s] - 2026-07-14\n' "$tag"
        printf '\n'
        printf '### Added\n'
        printf '\n'
        printf -- '- Release notes.\n'
        printf '\n'
        printf '[Unreleased]: https://github.com/pavelmudroch/coderail/compare/%s...HEAD\n' "$tag"
        if [ -n "$compare_previous_version" ]; then
            printf '[%s]: https://github.com/pavelmudroch/coderail/compare/v%s...%s\n' "$tag" "$compare_previous_version" "$tag"
        else
            printf '[%s]: https://github.com/pavelmudroch/coderail/releases/tag/%s\n' "$tag" "$tag"
        fi
    } > "$work_dir/CHANGELOG.md"
}

commit_all() {
    work_dir=$1
    message=$2

    git -C "$work_dir" add .
    git -C "$work_dir" commit -q -m "$message"
}

create_release_repo() {
    case_name=$1
    previous_version=$2
    target_version=$3
    repo_dir=$tmp_dir/$case_name
    work_dir=$repo_dir/work
    remote_dir=$repo_dir/origin.git

    mkdir -p "$work_dir/build"
    git init -q "$work_dir"
    git -C "$work_dir" checkout -q -b main
    git -C "$work_dir" config user.email test@example.invalid
    git -C "$work_dir" config user.name "Release Test"

    cp "$PROJECT_ROOT/build/release.sh" "$work_dir/build/release.sh"
    chmod +x "$work_dir/build/release.sh"
    write_release_metadata "$work_dir" "$previous_version"
    commit_all "$work_dir" "Initial release"

    git -C "$work_dir" tag -a "v$previous_version" -m "release version $previous_version"
    git -C "$work_dir" tag -a latest -m "latest version pointer"

    git init -q --bare "$remote_dir"
    git -C "$work_dir" remote add origin "$remote_dir"
    git -C "$work_dir" push -q origin main "v$previous_version" latest

    write_release_metadata "$work_dir" "$target_version" "$previous_version"
    commit_all "$work_dir" "Prepare release $target_version"

    printf '%s\n' "$work_dir"
}

create_repo_without_release_tag() {
    case_name=$1
    target_version=$2
    repo_dir=$tmp_dir/$case_name
    work_dir=$repo_dir/work
    remote_dir=$repo_dir/origin.git

    mkdir -p "$work_dir/build"
    git init -q "$work_dir"
    git -C "$work_dir" checkout -q -b main
    git -C "$work_dir" config user.email test@example.invalid
    git -C "$work_dir" config user.name "Release Test"

    cp "$PROJECT_ROOT/build/release.sh" "$work_dir/build/release.sh"
    chmod +x "$work_dir/build/release.sh"
    write_release_metadata "$work_dir" "$target_version"
    commit_all "$work_dir" "Initial commit"

    git init -q --bare "$remote_dir"
    git -C "$work_dir" remote add origin "$remote_dir"
    git -C "$work_dir" push -q origin main

    printf '%s\n' "$work_dir"
}

run_release() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    (
        cd "$tmp_dir"
        sh "$work_dir/build/release.sh" "$@"
    ) > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

add_release_tag() {
    work_dir=$1
    version=$2

    git -C "$work_dir" tag -a "v$version" -m "release version $version"
}

add_remote_release_tag_at_ref() {
    work_dir=$1
    version=$2
    ref=$3

    git -C "$work_dir" tag -a "v$version" -m "release version $version" "$ref"
    git -C "$work_dir" push -q origin "v$version"
    git -C "$work_dir" tag -d "v$version" >/dev/null
}

add_remote_release_tag() {
    work_dir=$1
    version=$2

    add_remote_release_tag_at_ref "$work_dir" "$version" HEAD
}

reject_remote_pushes() {
    work_dir=$1
    remote_dir=$(git -C "$work_dir" remote get-url origin)

    {
        printf '#!/usr/bin/env sh\n'
        printf 'exit 1\n'
    } > "$remote_dir/hooks/pre-receive"
    chmod +x "$remote_dir/hooks/pre-receive"
}

assert_help_output_succeeds() {
    work_dir=$(create_release_repo help 1.0.0 1.0.1)

    run_release "$work_dir" --help

    assert_success
    assert_stdout_contains "Usage:"
    assert_stdout_contains "--patch"
}

assert_argument_errors_fail() {
    work_dir=$(create_release_repo missing-flag 1.0.0 1.0.1)
    run_release "$work_dir"
    assert_failure
    assert_stderr_contains "missing bump flag"

    work_dir=$(create_release_repo multiple-flags 1.0.0 1.0.1)
    run_release "$work_dir" --patch --minor
    assert_failure
    assert_stderr_contains "multiple bump flags"

    work_dir=$(create_release_repo unknown-option 1.0.0 1.0.1)
    run_release "$work_dir" --feature
    assert_failure
    assert_stderr_contains "unknown option: --feature"

    work_dir=$(create_release_repo positional-argument 1.0.0 1.0.1)
    run_release "$work_dir" 1.0.1
    assert_failure
    assert_stderr_contains "unexpected argument: 1.0.1"
}

assert_patch_minor_and_major_targets() {
    work_dir=$(create_release_repo patch-target 1.2.3 1.2.4)
    run_release "$work_dir" --patch
    assert_success
    assert_release_published "$work_dir" 1.2.4

    work_dir=$(create_release_repo minor-target 1.2.3 1.3.0)
    run_release "$work_dir" --minor
    assert_success
    assert_release_published "$work_dir" 1.3.0

    work_dir=$(create_release_repo major-target 1.2.3 2.0.0)
    run_release "$work_dir" --major
    assert_success
    assert_release_published "$work_dir" 2.0.0
}

assert_highest_semver_uses_numeric_ordering() {
    work_dir=$(create_release_repo numeric-order 1.10.0 1.10.1)
    add_release_tag "$work_dir" 1.9.9

    run_release "$work_dir" --patch

    assert_success
    assert_release_published "$work_dir" 1.10.1
}

assert_ignored_tags_do_not_affect_target() {
    work_dir=$(create_release_repo ignored-tags 1.0.0 1.0.1)

    git -C "$work_dir" tag -a v9.9.9-rc.1 -m ignored
    git -C "$work_dir" tag -a release-9.9.9 -m ignored
    git -C "$work_dir" tag -a v2.0 -m ignored
    git -C "$work_dir" tag -a v2.0.0.1 -m ignored

    run_release "$work_dir" --patch

    assert_success
    assert_release_published "$work_dir" 1.0.1
}

assert_remote_tags_are_considered() {
    work_dir=$(create_release_repo remote-tags 1.0.0 1.10.1)
    add_remote_release_tag "$work_dir" 1.10.0
    write_release_metadata "$work_dir" 1.10.1 1.10.0
    commit_all "$work_dir" "Update release metadata for remote tag"

    run_release "$work_dir" --patch

    assert_success
    assert_release_published "$work_dir" 1.10.1
}

assert_missing_initial_release_tag_fails() {
    work_dir=$(create_repo_without_release_tag no-initial-tag 0.1.0)

    run_release "$work_dir" --minor

    assert_failure
    assert_stderr_contains "initial stable release tag required"
    assert_tag_missing "$work_dir" v0.1.0
}

assert_non_main_branch_fails_before_tags() {
    work_dir=$(create_release_repo branch-check 1.0.0 1.0.1)
    latest_ref=$(git -C "$work_dir" rev-parse refs/tags/latest)
    git -C "$work_dir" checkout -q -b release

    run_release "$work_dir" --patch

    assert_failure
    assert_stderr_contains "current branch must be main"
    assert_tag_missing "$work_dir" v1.0.1
    assert_tag_ref "$work_dir" latest "$latest_ref"
}

assert_dirty_worktree_states_fail_before_tags() {
    work_dir=$(create_release_repo dirty-staged 1.0.0 1.0.1)
    latest_ref=$(git -C "$work_dir" rev-parse refs/tags/latest)
    printf 'staged\n' > "$work_dir/dirty.txt"
    git -C "$work_dir" add dirty.txt
    run_release "$work_dir" --patch
    assert_failure
    assert_stderr_contains "worktree must be clean"
    assert_tag_missing "$work_dir" v1.0.1
    assert_tag_ref "$work_dir" latest "$latest_ref"

    work_dir=$(create_release_repo dirty-unstaged 1.0.0 1.0.1)
    latest_ref=$(git -C "$work_dir" rev-parse refs/tags/latest)
    printf 'changed\n' >> "$work_dir/lib/version.sh"
    run_release "$work_dir" --patch
    assert_failure
    assert_stderr_contains "worktree must be clean"
    assert_tag_missing "$work_dir" v1.0.1
    assert_tag_ref "$work_dir" latest "$latest_ref"

    work_dir=$(create_release_repo dirty-untracked 1.0.0 1.0.1)
    latest_ref=$(git -C "$work_dir" rev-parse refs/tags/latest)
    printf 'untracked\n' > "$work_dir/untracked.txt"
    run_release "$work_dir" --patch
    assert_failure
    assert_stderr_contains "worktree must be clean"
    assert_tag_missing "$work_dir" v1.0.1
    assert_tag_ref "$work_dir" latest "$latest_ref"
}

assert_existing_local_tag_fails_without_replace() {
    work_dir=$(create_release_repo local-existing-tag 1.0.0 1.0.1)
    add_release_tag "$work_dir" 1.0.1
    target_ref=$(git -C "$work_dir" rev-parse refs/tags/v1.0.1)

    run_release "$work_dir" --patch

    assert_failure
    assert_stderr_contains "already exists locally: v1.0.1"
    assert_tag_ref "$work_dir" v1.0.1 "$target_ref"
}

assert_existing_remote_tag_fails() {
    work_dir=$(create_release_repo remote-existing-tag 1.0.0 1.0.1)
    add_remote_release_tag_at_ref "$work_dir" 1.0.1 HEAD~1
    remote_target_ref=$(git --git-dir="$(git -C "$work_dir" remote get-url origin)" rev-parse refs/tags/v1.0.1)

    run_release "$work_dir" --patch

    assert_failure
    assert_stderr_contains "already exists on origin: v1.0.1"
    assert_tag_missing "$work_dir" v1.0.1
    assert_remote_tag_ref "$work_dir" v1.0.1 "$remote_target_ref"
}

assert_version_metadata_mismatch_fails() {
    work_dir=$(create_release_repo version-mismatch 1.0.0 1.0.1)
    latest_ref=$(git -C "$work_dir" rev-parse refs/tags/latest)
    printf 'coderail_version="9.9.9"\n' > "$work_dir/lib/version.sh"
    commit_all "$work_dir" "Break version metadata"

    run_release "$work_dir" --patch

    assert_failure
    assert_stderr_contains 'expected lib/version.sh to contain coderail_version="1.0.1"'
    assert_tag_missing "$work_dir" v1.0.1
    assert_tag_ref "$work_dir" latest "$latest_ref"
}

assert_missing_changelog_section_fails() {
    work_dir=$(create_release_repo missing-section 1.0.0 1.0.1)
    latest_ref=$(git -C "$work_dir" rev-parse refs/tags/latest)
    {
        printf '# Changelog\n'
        printf '\n'
        printf '## [Unreleased]\n'
        printf '\n'
        printf '[Unreleased]: https://github.com/pavelmudroch/coderail/compare/v1.0.1...HEAD\n'
        printf '[v1.0.1]: https://github.com/pavelmudroch/coderail/compare/v1.0.0...v1.0.1\n'
    } > "$work_dir/CHANGELOG.md"
    commit_all "$work_dir" "Remove changelog section"

    run_release "$work_dir" --patch

    assert_failure
    assert_stderr_contains "expected CHANGELOG.md release section for v1.0.1"
    assert_tag_missing "$work_dir" v1.0.1
    assert_tag_ref "$work_dir" latest "$latest_ref"
}

assert_missing_release_link_fails() {
    work_dir=$(create_release_repo missing-release-link 1.0.0 1.0.1)
    latest_ref=$(git -C "$work_dir" rev-parse refs/tags/latest)
    {
        printf '# Changelog\n'
        printf '\n'
        printf '## [Unreleased]\n'
        printf '\n'
        printf '## [v1.0.1] - 2026-07-14\n'
        printf '\n'
        printf '[Unreleased]: https://github.com/pavelmudroch/coderail/compare/v1.0.1...HEAD\n'
    } > "$work_dir/CHANGELOG.md"
    commit_all "$work_dir" "Remove release link"

    run_release "$work_dir" --patch

    assert_failure
    assert_stderr_contains "expected CHANGELOG.md release compare link"
    assert_tag_missing "$work_dir" v1.0.1
    assert_tag_ref "$work_dir" latest "$latest_ref"
}

assert_stale_unreleased_link_fails() {
    work_dir=$(create_release_repo stale-unreleased-link 1.0.0 1.0.1)
    latest_ref=$(git -C "$work_dir" rev-parse refs/tags/latest)
    {
        printf '# Changelog\n'
        printf '\n'
        printf '## [Unreleased]\n'
        printf '\n'
        printf '## [v1.0.1] - 2026-07-14\n'
        printf '\n'
        printf '[Unreleased]: https://github.com/pavelmudroch/coderail/compare/v1.0.0...HEAD\n'
        printf '[v1.0.1]: https://github.com/pavelmudroch/coderail/compare/v1.0.0...v1.0.1\n'
    } > "$work_dir/CHANGELOG.md"
    commit_all "$work_dir" "Stale unreleased link"

    run_release "$work_dir" --patch

    assert_failure
    assert_stderr_contains "expected CHANGELOG.md [Unreleased] link"
    assert_tag_missing "$work_dir" v1.0.1
    assert_tag_ref "$work_dir" latest "$latest_ref"
}

assert_success_publishes_release_tags() {
    work_dir=$(create_release_repo successful-publish 1.0.0 1.0.1)

    run_release "$work_dir" --patch

    assert_success
    assert_release_published "$work_dir" 1.0.1
}

assert_push_failure_restores_existing_latest() {
    work_dir=$(create_release_repo push-failure-existing-latest 1.0.0 1.0.1)
    latest_ref=$(git -C "$work_dir" rev-parse refs/tags/latest)
    previous_commit=$(git -C "$work_dir" rev-parse HEAD~1)
    reject_remote_pushes "$work_dir"

    run_release "$work_dir" --patch

    assert_failure
    assert_stderr_contains "failed to push release tags to origin"
    assert_tag_missing "$work_dir" v1.0.1
    assert_tag_ref "$work_dir" latest "$latest_ref"
    assert_remote_tag_missing "$work_dir" v1.0.1
    assert_remote_tag_resolves_to_commit "$work_dir" latest "$previous_commit"
}

assert_push_failure_removes_new_latest() {
    work_dir=$(create_release_repo push-failure-new-latest 1.0.0 1.0.1)
    previous_commit=$(git -C "$work_dir" rev-parse HEAD~1)
    git -C "$work_dir" tag -d latest >/dev/null
    reject_remote_pushes "$work_dir"

    run_release "$work_dir" --patch

    assert_failure
    assert_stderr_contains "failed to push release tags to origin"
    assert_tag_missing "$work_dir" v1.0.1
    assert_tag_missing "$work_dir" latest
    assert_remote_tag_missing "$work_dir" v1.0.1
    assert_remote_tag_resolves_to_commit "$work_dir" latest "$previous_commit"
}

print_tests_header "Release Helper Tests"
test "Help output succeeds" assert_help_output_succeeds
test "Argument errors fail" assert_argument_errors_fail
test "Patch, minor, and major targets derive" assert_patch_minor_and_major_targets
test "Highest SemVer uses numeric ordering" assert_highest_semver_uses_numeric_ordering
test "Ignored tags do not affect target" assert_ignored_tags_do_not_affect_target
test "Remote tags are considered" assert_remote_tags_are_considered
test "Missing initial release tag fails" assert_missing_initial_release_tag_fails
test "Non-main branch fails before tags" assert_non_main_branch_fails_before_tags
test "Dirty worktree states fail before tags" assert_dirty_worktree_states_fail_before_tags
test "Existing local tag fails without replace" assert_existing_local_tag_fails_without_replace
test "Existing remote tag fails" assert_existing_remote_tag_fails
test "Version metadata mismatch fails" assert_version_metadata_mismatch_fails
test "Missing changelog section fails" assert_missing_changelog_section_fails
test "Missing release link fails" assert_missing_release_link_fails
test "Stale Unreleased link fails" assert_stale_unreleased_link_fails
test "Successful publish creates and pushes tags" assert_success_publishes_release_tags
test "Push failure restores existing latest" assert_push_failure_restores_existing_latest
test "Push failure removes new latest" assert_push_failure_removes_new_latest
print_tests_summary

if some_tests_failed; then
    exit 1
fi

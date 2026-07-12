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

HELPER=$PROJECT_ROOT/lib/utils/archive_apply.sh
TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-archive-apply-test.XXXXXX")

. "$PROJECT_ROOT/test/suite.sh"
CODERAIL_ARCHIVE_APPLY_NO_MAIN=1 . "$HELPER"
unset CODERAIL_ARCHIVE_APPLY_NO_MAIN

cleanup() {
    chmod -R u+rwX "$tmp_dir" 2>/dev/null || :
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

assert_dir() {
    [ -d "$1" ] || fail "missing directory: $1"
}

assert_path_missing() {
    [ ! -e "$1" ] || fail "path should not exist: $1"
}

assert_executable() {
    [ -x "$1" ] || fail "path should be executable: $1"
}

assert_contains() {
    grep -F "$2" "$1" >/dev/null || fail "$1 does not contain: $2"
}

assert_not_contains() {
    ! grep -F "$2" "$1" >/dev/null || fail "$1 contains: $2"
}

assert_equals() {
    actual=$1
    expected=$2

    [ "$actual" = "$expected" ] ||
        fail "expected '$expected', got '$actual'"
}

assert_command_fails() {
    set +e
    "$@" >/dev/null 2>&1
    status=$?
    set -e

    [ "$status" -ne 0 ] || fail "command unexpectedly succeeded: $*"
}

assert_success() {
    [ "$run_status" -eq 0 ] || fail "expected success, got status $run_status"
}

assert_failure() {
    [ "$run_status" -ne 0 ] || fail "expected failure"
}

run_helper() {
    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    sh "$HELPER" "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

create_source_tree() {
    source_root=$1
    label=$2

    mkdir -p "$source_root/bin"
    mkdir -p "$source_root/lib/commands"
    mkdir -p "$source_root/lib/utils"
    mkdir -p "$source_root/instructions/skills/example"
    mkdir -p "$source_root/.coderail"
    mkdir -p "$source_root/test"

    cat > "$source_root/bin/cr" <<EOF
#!/usr/bin/env sh
echo "$label"
EOF
    chmod 644 "$source_root/bin/cr"

    printf 'command %s\n' "$label" > "$source_root/lib/commands/example.sh"
    printf 'utility %s\n' "$label" > "$source_root/lib/utils/example.sh"
    printf 'skill %s\n' "$label" > "$source_root/instructions/skills/example/SKILL.md"
    printf 'readme %s\n' "$label" > "$source_root/README.md"
    printf 'changelog %s\n' "$label" > "$source_root/CHANGELOG.md"
    printf 'license %s\n' "$label" > "$source_root/LICENSE"
    printf 'install %s\n' "$label" > "$source_root/INSTALL"

    printf 'manifest should not be copied\n' > "$source_root/.coderail-install"
    printf 'config should not be copied\n' > "$source_root/config.ini"
    printf 'project state should not be copied\n' > "$source_root/.coderail/config.ini"
    printf 'tests should not be copied\n' > "$source_root/test/example.test.sh"
}

create_archive() {
    archive_file=$1
    label=$2
    archive_parent=$tmp_dir/archive-$label
    archive_root=$archive_parent/coderail-$label

    mkdir -p "$archive_parent"
    create_source_tree "$archive_root" "$label"
    (
        cd "$archive_parent" &&
            tar -czf "$archive_file" "coderail-$label"
    )
}

write_fake_curl() {
    fake_dir=$1

    cat > "$fake_dir/curl" <<'EOF'
#!/bin/sh
out=
url=
while [ "$#" -gt 0 ]; do
    case "$1" in
        -o)
            shift
            out=$1
            ;;
        http*)
            url=$1
            ;;
    esac
    shift
done

[ -n "$out" ] || exit 1
printf 'curl %s\n' "$url" >> "$FAKE_LOG"

if [ -n "${FAKE_ARCHIVE:-}" ]; then
    cp "$FAKE_ARCHIVE" "$out"
else
    printf '%s\n' "$url" > "$out"
fi
EOF
    chmod +x "$fake_dir/curl"
}

write_fake_wget() {
    fake_dir=$1

    cat > "$fake_dir/wget" <<'EOF'
#!/bin/sh
out=
url=
while [ "$#" -gt 0 ]; do
    case "$1" in
        -O)
            shift
            out=$1
            ;;
        http*)
            url=$1
            ;;
    esac
    shift
done

[ -n "$out" ] || exit 1
printf 'wget %s\n' "$url" >> "$FAKE_LOG"
printf '%s\n' "$url" > "$out"
EOF
    chmod +x "$fake_dir/wget"
}

link_required_command() {
    fake_dir=$1
    command_name=$2
    command_path=$(command -v "$command_name")

    ln -s "$command_path" "$fake_dir/$command_name"
}

assert_target_resolution() {
    latest_url=https://github.com/pavelmudroch/coderail/archive/refs/tags/latest.tar.gz
    main_url=https://github.com/pavelmudroch/coderail/archive/refs/heads/main.tar.gz
    tag_url=https://github.com/pavelmudroch/coderail/archive/refs/tags/v1.2.3.tar.gz

    assert_equals "$(coderail_archive_target_ref latest)" latest
    assert_equals "$(coderail_archive_target_url latest)" "$latest_url"
    assert_equals "$(coderail_archive_target_ref main)" main
    assert_equals "$(coderail_archive_target_url main)" "$main_url"
    assert_equals "$(coderail_archive_target_ref 1.2.3)" v1.2.3
    assert_equals "$(coderail_archive_target_url 1.2.3)" "$tag_url"
    assert_equals "$(coderail_archive_target_ref v1.2.3)" v1.2.3
    assert_equals "$(coderail_archive_target_url v1.2.3)" "$tag_url"

    run_helper resolve-target main
    assert_success
    assert_contains "$run_stdout" "$main_url"

    assert_command_fails coderail_archive_target_ref ""
    assert_command_fails coderail_archive_target_ref feature
    assert_command_fails coderail_archive_target_ref deadbeef
    assert_command_fails coderail_archive_target_ref 1.2
    assert_command_fails coderail_archive_target_ref v1.2.3-beta
}

assert_stage_managed_file_set() {
    source_root=$tmp_dir/source-stage
    stage_dir=$tmp_dir/stage
    manifest_file=$tmp_dir/stage.manifest

    create_source_tree "$source_root" stage
    sh "$HELPER" stage-source "$source_root" "$stage_dir" "$manifest_file" >/dev/null

    assert_file "$stage_dir/bin/cr"
    assert_file "$stage_dir/lib/commands/example.sh"
    assert_file "$stage_dir/lib/utils/example.sh"
    assert_file "$stage_dir/instructions/skills/example/SKILL.md"
    assert_file "$stage_dir/README.md"
    assert_file "$stage_dir/CHANGELOG.md"
    assert_file "$stage_dir/LICENSE"
    assert_file "$stage_dir/INSTALL"
    assert_executable "$stage_dir/bin/cr"
    assert_file "$manifest_file"

    assert_path_missing "$stage_dir/.coderail-install"
    assert_path_missing "$stage_dir/config.ini"
    assert_path_missing "$stage_dir/.coderail"
    assert_path_missing "$stage_dir/test"

    assert_contains "$manifest_file" "bin/cr"
    assert_contains "$manifest_file" "INSTALL"
    assert_not_contains "$manifest_file" ".coderail-install"
    assert_not_contains "$manifest_file" "config.ini"
    assert_not_contains "$manifest_file" ".coderail/"
    assert_not_contains "$manifest_file" "test/"
}

assert_download_prefers_curl() {
    fake_dir=$tmp_dir/fake-curl
    archive_file=$tmp_dir/curl-download.tar.gz
    fake_log=$tmp_dir/curl.log

    mkdir "$fake_dir"
    : > "$fake_log"
    write_fake_curl "$fake_dir"

    FAKE_LOG=$fake_log PATH="$fake_dir:$PATH" \
        sh "$HELPER" download-archive latest "$archive_file"

    assert_file "$archive_file"
    assert_contains "$archive_file" "https://github.com/pavelmudroch/coderail/archive/refs/tags/latest.tar.gz"
    assert_contains "$fake_log" "curl https://github.com/pavelmudroch/coderail/archive/refs/tags/latest.tar.gz"
}

assert_download_falls_back_to_wget() {
    fake_dir=$tmp_dir/fake-wget
    archive_file=$tmp_dir/wget-download.tar.gz
    fake_log=$tmp_dir/wget.log

    mkdir "$fake_dir"
    : > "$fake_log"
    write_fake_wget "$fake_dir"
    link_required_command "$fake_dir" awk

    FAKE_LOG=$fake_log PATH="$fake_dir" \
        /bin/sh "$HELPER" download-archive main "$archive_file"

    assert_file "$archive_file"
    assert_contains "$archive_file" "https://github.com/pavelmudroch/coderail/archive/refs/heads/main.tar.gz"
    assert_contains "$fake_log" "wget https://github.com/pavelmudroch/coderail/archive/refs/heads/main.tar.gz"
}

assert_apply_target_uses_downloaded_archive() {
    fake_dir=$tmp_dir/fake-apply-target
    archive_file=$tmp_dir/apply-target.tar.gz
    fake_log=$tmp_dir/apply-target.log
    install_root=$tmp_dir/apply-target-install

    mkdir "$fake_dir"
    : > "$fake_log"
    create_archive "$archive_file" target
    write_fake_curl "$fake_dir"

    FAKE_LOG=$fake_log FAKE_ARCHIVE=$archive_file PATH="$fake_dir:$PATH" \
        sh "$HELPER" apply-target main "$install_root" false

    assert_file "$install_root/bin/cr"
    assert_executable "$install_root/bin/cr"
    assert_file "$install_root/.coderail-install"
    assert_contains "$fake_log" "curl https://github.com/pavelmudroch/coderail/archive/refs/heads/main.tar.gz"
}

assert_invalid_archive_layout_fails() {
    fake_dir=$tmp_dir/fake-invalid-archive
    archive_file=$tmp_dir/invalid-layout.tar.gz
    invalid_parent=$tmp_dir/invalid-layout
    fake_log=$tmp_dir/invalid-layout.log
    install_root=$tmp_dir/invalid-layout-install

    mkdir "$fake_dir"
    mkdir -p "$invalid_parent/one" "$invalid_parent/two"
    : > "$fake_log"
    (
        cd "$invalid_parent" &&
            tar -czf "$archive_file" one two
    )
    write_fake_curl "$fake_dir"

    set +e
    FAKE_LOG=$fake_log FAKE_ARCHIVE=$archive_file PATH="$fake_dir:$PATH" \
        sh "$HELPER" apply-target latest "$install_root" false >/dev/null 2>&1
    status=$?
    set -e

    [ "$status" -ne 0 ] || fail "invalid archive unexpectedly succeeded"
    assert_path_missing "$install_root/bin/cr"
}

assert_apply_source_preserves_user_files() {
    source_root=$tmp_dir/source-apply
    install_root=$tmp_dir/install-apply

    create_source_tree "$source_root" apply
    mkdir "$install_root"
    printf 'user config\n' > "$install_root/config.ini"

    coderail_archive_apply_source "$source_root" "$install_root" false

    assert_file "$install_root/bin/cr"
    assert_executable "$install_root/bin/cr"
    assert_file "$install_root/lib/commands/example.sh"
    assert_file "$install_root/instructions/skills/example/SKILL.md"
    assert_file "$install_root/INSTALL"
    assert_file "$install_root/config.ini"
    assert_contains "$install_root/config.ini" "user config"
    assert_file "$install_root/.coderail-install"
    assert_not_contains "$install_root/.coderail-install" "config.ini"
    assert_not_contains "$install_root/.coderail-install" ".coderail/"
    assert_not_contains "$install_root/.coderail-install" "test/"
}

assert_apply_refuses_untracked_collision() {
    source_root=$tmp_dir/source-collision
    install_root=$tmp_dir/install-collision

    create_source_tree "$source_root" collision
    mkdir -p "$install_root/bin"
    printf 'user binary\n' > "$install_root/bin/cr"

    assert_command_fails coderail_archive_apply_source "$source_root" "$install_root" false
    assert_contains "$install_root/bin/cr" "user binary"
}

assert_apply_force_replaces_untracked_collision() {
    source_root=$tmp_dir/source-force-collision
    install_root=$tmp_dir/install-force-collision

    create_source_tree "$source_root" force-collision
    mkdir -p "$install_root/bin"
    printf 'user binary\n' > "$install_root/bin/cr"

    coderail_archive_apply_source "$source_root" "$install_root" true

    assert_contains "$install_root/bin/cr" "force-collision"
    assert_not_contains "$install_root/bin/cr" "user binary"
    assert_executable "$install_root/bin/cr"
}

assert_apply_refuses_modified_managed_file() {
    source_v1=$tmp_dir/source-modified-v1
    source_v2=$tmp_dir/source-modified-v2
    install_root=$tmp_dir/install-modified

    create_source_tree "$source_v1" modified-v1
    create_source_tree "$source_v2" modified-v2
    coderail_archive_apply_source "$source_v1" "$install_root" false
    printf 'local modification\n' >> "$install_root/lib/commands/example.sh"

    assert_command_fails coderail_archive_apply_source "$source_v2" "$install_root" false
    assert_contains "$install_root/lib/commands/example.sh" "modified-v1"
    assert_contains "$install_root/lib/commands/example.sh" "local modification"
}

assert_apply_force_replaces_modified_managed_file() {
    source_v1=$tmp_dir/source-force-modified-v1
    source_v2=$tmp_dir/source-force-modified-v2
    install_root=$tmp_dir/install-force-modified

    create_source_tree "$source_v1" force-modified-v1
    create_source_tree "$source_v2" force-modified-v2
    coderail_archive_apply_source "$source_v1" "$install_root" false
    printf 'local modification\n' >> "$install_root/lib/commands/example.sh"

    coderail_archive_apply_source "$source_v2" "$install_root" true

    assert_contains "$install_root/lib/commands/example.sh" "force-modified-v2"
    assert_not_contains "$install_root/lib/commands/example.sh" "local modification"
}

assert_legacy_install_requires_force() {
    source_root=$tmp_dir/source-legacy
    install_root=$tmp_dir/install-legacy

    create_source_tree "$source_root" legacy
    mkdir -p "$install_root/lib/commands"
    printf 'legacy file\n' > "$install_root/lib/commands/example.sh"

    assert_command_fails coderail_archive_apply_source "$source_root" "$install_root" false
    assert_contains "$install_root/lib/commands/example.sh" "legacy file"

    coderail_archive_apply_source "$source_root" "$install_root" true

    assert_contains "$install_root/lib/commands/example.sh" "legacy"
    assert_not_contains "$install_root/lib/commands/example.sh" "legacy file"
    assert_file "$install_root/.coderail-install"
}

assert_invalid_manifest_path_blocks_apply() {
    source_root=$tmp_dir/source-invalid-manifest
    install_root=$tmp_dir/install-invalid-manifest

    create_source_tree "$source_root" invalid-manifest
    mkdir "$install_root"
    printf '1 1 ../outside\n' > "$install_root/.coderail-install"

    assert_command_fails coderail_archive_apply_source "$source_root" "$install_root" false
    assert_path_missing "$install_root/bin/cr"
}

assert_stale_file_detection_and_removal() {
    source_v1=$tmp_dir/source-stale-v1
    source_v2=$tmp_dir/source-stale-v2
    install_root=$tmp_dir/install-stale
    old_manifest=$tmp_dir/old.manifest
    stale_paths=$tmp_dir/stale.paths

    create_source_tree "$source_v1" stale-v1
    printf 'stale\n' > "$source_v1/lib/commands/stale.sh"
    create_source_tree "$source_v2" stale-v2

    coderail_archive_apply_source "$source_v1" "$install_root" false
    cp "$install_root/.coderail-install" "$old_manifest"
    coderail_archive_apply_source "$source_v2" "$install_root" false

    coderail_archive_stale_manifest_paths "$old_manifest" "$install_root/.coderail-install" > "$stale_paths"

    assert_contains "$stale_paths" "lib/commands/stale.sh"
    assert_path_missing "$install_root/lib/commands/stale.sh"
    assert_file "$install_root/lib/commands/example.sh"
}

assert_modified_stale_file_requires_force() {
    source_v1=$tmp_dir/source-modified-stale-v1
    source_v2=$tmp_dir/source-modified-stale-v2
    install_root=$tmp_dir/install-modified-stale

    create_source_tree "$source_v1" modified-stale-v1
    printf 'stale\n' > "$source_v1/lib/commands/stale.sh"
    create_source_tree "$source_v2" modified-stale-v2
    coderail_archive_apply_source "$source_v1" "$install_root" false
    printf 'local stale modification\n' >> "$install_root/lib/commands/stale.sh"

    assert_command_fails coderail_archive_apply_source "$source_v2" "$install_root" false

    assert_file "$install_root/lib/commands/stale.sh"
    assert_contains "$install_root/lib/commands/stale.sh" "local stale modification"
    assert_contains "$install_root/.coderail-install" "lib/commands/stale.sh"
}

assert_force_removes_modified_stale_file() {
    source_v1=$tmp_dir/source-force-stale-v1
    source_v2=$tmp_dir/source-force-stale-v2
    install_root=$tmp_dir/install-force-stale

    create_source_tree "$source_v1" force-stale-v1
    printf 'stale\n' > "$source_v1/lib/commands/stale.sh"
    create_source_tree "$source_v2" force-stale-v2
    coderail_archive_apply_source "$source_v1" "$install_root" false
    printf 'local stale modification\n' >> "$install_root/lib/commands/stale.sh"

    coderail_archive_apply_source "$source_v2" "$install_root" true

    assert_path_missing "$install_root/lib/commands/stale.sh"
    assert_not_contains "$install_root/.coderail-install" "lib/commands/stale.sh"
    assert_file "$install_root/lib/commands/example.sh"
}

assert_upgrade_replaces_modified_managed_file() {
    source_v1=$tmp_dir/source-upgrade-modified-v1
    source_v2=$tmp_dir/source-upgrade-modified-v2
    install_root=$tmp_dir/install-upgrade-modified

    create_source_tree "$source_v1" upgrade-modified-v1
    create_source_tree "$source_v2" upgrade-modified-v2
    coderail_archive_apply_source "$source_v1" "$install_root" false
    printf 'local modification\n' >> "$install_root/lib/commands/example.sh"

    coderail_archive_apply_source_policy "$source_v2" "$install_root" upgrade

    assert_contains "$install_root/lib/commands/example.sh" "upgrade-modified-v2"
    assert_not_contains "$install_root/lib/commands/example.sh" "local modification"
}

assert_upgrade_refuses_untracked_collision() {
    source_v1=$tmp_dir/source-upgrade-collision-v1
    source_v2=$tmp_dir/source-upgrade-collision-v2
    install_root=$tmp_dir/install-upgrade-collision

    create_source_tree "$source_v1" upgrade-collision-v1
    create_source_tree "$source_v2" upgrade-collision-v2
    coderail_archive_apply_source "$source_v1" "$install_root" false
    printf 'new managed file\n' > "$source_v2/lib/commands/new.sh"
    printf 'user file\n' > "$install_root/lib/commands/new.sh"

    assert_command_fails \
        coderail_archive_apply_source_policy "$source_v2" "$install_root" upgrade

    assert_contains "$install_root/lib/commands/new.sh" "user file"
    assert_contains "$install_root/lib/commands/example.sh" "upgrade-collision-v1"
}

assert_upgrade_removes_modified_stale_file() {
    source_v1=$tmp_dir/source-upgrade-stale-v1
    source_v2=$tmp_dir/source-upgrade-stale-v2
    install_root=$tmp_dir/install-upgrade-stale

    create_source_tree "$source_v1" upgrade-stale-v1
    printf 'stale\n' > "$source_v1/lib/commands/stale.sh"
    create_source_tree "$source_v2" upgrade-stale-v2
    coderail_archive_apply_source "$source_v1" "$install_root" false
    printf 'local stale modification\n' >> "$install_root/lib/commands/stale.sh"

    coderail_archive_apply_source_policy "$source_v2" "$install_root" upgrade

    assert_path_missing "$install_root/lib/commands/stale.sh"
    assert_not_contains "$install_root/.coderail-install" "lib/commands/stale.sh"
}

assert_validate_upgrade_install_accepts_checksum_mismatch() {
    source_root=$tmp_dir/source-validate-upgrade
    install_root=$tmp_dir/install-validate-upgrade

    create_source_tree "$source_root" validate-upgrade
    coderail_archive_apply_source "$source_root" "$install_root" false
    printf 'modified\n' >> "$install_root/bin/cr"

    run_helper validate-upgrade-install "$install_root"

    assert_success
}

assert_invalid_upgrade_manifest() {
    manifest_case=$1
    expected_error=$2
    install_root=$tmp_dir/install-invalid-upgrade-$manifest_case
    fake_dir=$tmp_dir/fake-invalid-upgrade-$manifest_case
    fake_log=$tmp_dir/invalid-upgrade-$manifest_case.log

    mkdir -p "$install_root/bin" "$fake_dir"
    printf 'existing cli\n' > "$install_root/bin/cr"
    : > "$fake_log"
    write_fake_curl "$fake_dir"

    case "$manifest_case" in
        missing)
            ;;
        malformed)
            printf 'malformed\n' > "$install_root/.coderail-install"
            ;;
        empty)
            : > "$install_root/.coderail-install"
            ;;
        missing-bin)
            printf 'user file\n' > "$install_root/user.txt"
            (
                cd "$install_root" && cksum user.txt
            ) > "$install_root/.coderail-install"
            ;;
    esac

    FAKE_LOG=$fake_log PATH="$fake_dir:$PATH" \
        run_helper upgrade-target latest "$install_root"

    assert_failure
    [ ! -s "$fake_log" ] || fail "invalid install triggered a download"
    assert_contains "$run_stderr" "$expected_error"
    assert_contains "$install_root/bin/cr" "existing cli"
}

assert_upgrade_target_applies_owned_changes() {
    source_v1=$tmp_dir/source-upgrade-target-v1
    archive_file=$tmp_dir/upgrade-target.tar.gz
    install_root=$tmp_dir/install-upgrade-target
    fake_dir=$tmp_dir/fake-upgrade-target
    fake_log=$tmp_dir/upgrade-target.log

    create_source_tree "$source_v1" upgrade-target-v1
    printf 'stale\n' > "$source_v1/lib/commands/stale.sh"
    coderail_archive_apply_source "$source_v1" "$install_root" false
    printf 'local modification\n' >> "$install_root/lib/commands/example.sh"
    printf 'local stale modification\n' >> "$install_root/lib/commands/stale.sh"
    printf 'user data\n' > "$install_root/user.txt"

    mkdir "$fake_dir"
    : > "$fake_log"
    create_archive "$archive_file" upgrade-target-v2
    write_fake_curl "$fake_dir"

    FAKE_LOG=$fake_log FAKE_ARCHIVE=$archive_file PATH="$fake_dir:$PATH" \
        run_helper upgrade-target latest "$install_root"

    assert_success
    assert_contains "$install_root/lib/commands/example.sh" "upgrade-target-v2"
    assert_not_contains "$install_root/lib/commands/example.sh" "local modification"
    assert_path_missing "$install_root/lib/commands/stale.sh"
    assert_not_contains "$install_root/.coderail-install" "lib/commands/stale.sh"
    assert_contains "$install_root/user.txt" "user data"
    assert_executable "$install_root/bin/cr"
}

assert_upgrade_target_rejects_untracked_collision() {
    source_v1=$tmp_dir/source-upgrade-target-collision-v1
    archive_file=$tmp_dir/upgrade-target-collision.tar.gz
    install_root=$tmp_dir/install-upgrade-target-collision
    old_manifest=$tmp_dir/upgrade-target-collision.manifest
    fake_dir=$tmp_dir/fake-upgrade-target-collision
    fake_log=$tmp_dir/upgrade-target-collision.log

    create_source_tree "$source_v1" upgrade-target-collision-v1
    coderail_archive_apply_source "$source_v1" "$install_root" false
    printf 'user file\n' > "$install_root/lib/commands/new.sh"
    cp "$install_root/.coderail-install" "$old_manifest"

    mkdir "$fake_dir"
    : > "$fake_log"
    create_archive "$archive_file" upgrade-target-collision-v2
    printf 'new managed file\n' > "$archive_root/lib/commands/new.sh"
    (
        cd "$archive_parent" &&
            tar -czf "$archive_file" "coderail-upgrade-target-collision-v2"
    )
    write_fake_curl "$fake_dir"

    FAKE_LOG=$fake_log FAKE_ARCHIVE=$archive_file PATH="$fake_dir:$PATH" \
        run_helper upgrade-target latest "$install_root"

    assert_failure
    assert_contains "$run_stderr" "refusing to overwrite untracked file"
    assert_contains "$install_root/lib/commands/new.sh" "user file"
    assert_contains "$install_root/lib/commands/example.sh" "upgrade-target-collision-v1"
    cmp -s "$old_manifest" "$install_root/.coderail-install" ||
        fail "upgrade collision changed the manifest"
}

print_tests_header "Archive Apply Helper Tests"
test "Resolve archive targets" assert_target_resolution
test "Stage managed file set" assert_stage_managed_file_set
test "Download prefers curl" assert_download_prefers_curl
test "Download falls back to wget" assert_download_falls_back_to_wget
test "Apply target uses downloaded archive" assert_apply_target_uses_downloaded_archive
test "Invalid archive layout fails" assert_invalid_archive_layout_fails
test "Apply source preserves user files" assert_apply_source_preserves_user_files
test "Apply refuses untracked collision" assert_apply_refuses_untracked_collision
test "Apply force replaces untracked collision" assert_apply_force_replaces_untracked_collision
test "Apply refuses modified managed file" assert_apply_refuses_modified_managed_file
test "Apply force replaces modified managed file" assert_apply_force_replaces_modified_managed_file
test "Legacy install requires force" assert_legacy_install_requires_force
test "Invalid manifest path blocks apply" assert_invalid_manifest_path_blocks_apply
test "Stale file detection and removal" assert_stale_file_detection_and_removal
test "Modified stale file requires force" assert_modified_stale_file_requires_force
test "Force removes modified stale file" assert_force_removes_modified_stale_file
test "Upgrade replaces modified managed file" assert_upgrade_replaces_modified_managed_file
test "Upgrade refuses untracked collision" assert_upgrade_refuses_untracked_collision
test "Upgrade removes modified stale file" assert_upgrade_removes_modified_stale_file
test "Upgrade validation ignores checksum mismatch" assert_validate_upgrade_install_accepts_checksum_mismatch
test "Upgrade rejects missing manifest before download" \
    assert_invalid_upgrade_manifest missing "not a regular file"
test "Upgrade rejects malformed manifest before download" \
    assert_invalid_upgrade_manifest malformed "invalid install manifest line"
test "Upgrade rejects empty manifest before download" \
    assert_invalid_upgrade_manifest empty "manifest is empty"
test "Upgrade rejects manifest without bin/cr before download" \
    assert_invalid_upgrade_manifest missing-bin "does not track bin/cr"
test "Upgrade target applies owned changes" assert_upgrade_target_applies_owned_changes
test "Upgrade target rejects untracked collision" assert_upgrade_target_rejects_untracked_collision

print_tests_summary

if some_tests_failed; then
    exit 1
fi

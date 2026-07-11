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
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-upgrade-test.XXXXXX")

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

assert_file() {
    [ -f "$1" ] || fail "missing file: $1"
}

assert_path_missing() {
    [ ! -e "$1" ] || fail "path should not exist: $1"
}

assert_executable() {
    [ -x "$1" ] || fail "path should be executable: $1"
}

assert_contains() {
    grep -F -- "$2" "$1" >/dev/null || fail "$1 does not contain: $2"
}

assert_not_contains() {
    ! grep -F -- "$2" "$1" >/dev/null || fail "$1 contains: $2"
}

assert_file_empty() {
    [ ! -s "$1" ] || fail "$1 should be empty"
}

assert_status() {
    actual=$1
    expected=$2

    [ "$actual" -eq "$expected" ] ||
        fail "expected status $expected, got $actual"
}

write_manifest() {
    install_root=$1
    manifest_tmp=$tmp_dir/manifest

    : > "$manifest_tmp"
    (
        cd "$install_root"
        find bin lib -type f | sort | while IFS= read -r managed_file; do
            cksum "$managed_file"
        done
    ) > "$manifest_tmp"
    mv "$manifest_tmp" "$install_root/.coderail-install"
}

create_cli_install() {
    install_root=$1

    mkdir -p "$install_root/bin"
    mkdir -p "$install_root/lib/commands"
    mkdir -p "$install_root/lib/utils"

    cp "$PROJECT_ROOT/bin/cr" "$install_root/bin/cr"
    cp "$PROJECT_ROOT/lib/commands/upgrade.sh" "$install_root/lib/commands/upgrade.sh"
    cp "$PROJECT_ROOT/lib/utils/archive_apply.sh" "$install_root/lib/utils/archive_apply.sh"
    cp "$PROJECT_ROOT/lib/utils/args.sh" "$install_root/lib/utils/args.sh"
    cp "$PROJECT_ROOT/lib/utils/log.sh" "$install_root/lib/utils/log.sh"
    chmod 755 "$install_root/bin/cr"
    write_manifest "$install_root"
}

create_source_tree() {
    source_root=$1
    label=$2

    mkdir -p "$source_root/bin"
    mkdir -p "$source_root/lib/commands"
    mkdir -p "$source_root/lib/utils"
    mkdir -p "$source_root/instructions/skills/example"

    cat > "$source_root/bin/cr" <<EOF
#!/usr/bin/env sh
echo "$label"
EOF
    chmod 644 "$source_root/bin/cr"

    printf 'upgrade command %s\n' "$label" > "$source_root/lib/commands/upgrade.sh"
    printf 'archive helper %s\n' "$label" > "$source_root/lib/utils/archive_apply.sh"
    printf 'readme %s\n' "$label" > "$source_root/README.md"
    printf 'changelog %s\n' "$label" > "$source_root/CHANGELOG.md"
    printf 'license %s\n' "$label" > "$source_root/LICENSE"
    printf 'install %s\n' "$label" > "$source_root/INSTALL"
    printf 'skill %s\n' "$label" > "$source_root/instructions/skills/example/SKILL.md"
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
cp "$FAKE_ARCHIVE" "$out"
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
cp "$FAKE_ARCHIVE" "$out"
EOF
    chmod +x "$fake_dir/wget"
}

link_required_command() {
    fake_dir=$1
    command_name=$2
    command_path=$(command -v "$command_name" || :)

    case "$command_path" in
        /*)
            ;;
        *)
            command_path=
            for command_dir in /bin /usr/bin; do
                if [ -x "$command_dir/$command_name" ]; then
                    command_path=$command_dir/$command_name
                    break
                fi
            done
            ;;
    esac

    [ -n "$command_path" ] || fail "required command not found: $command_name"
    ln -s "$command_path" "$fake_dir/$command_name"
}

link_upgrade_runtime_commands() {
    fake_dir=$1

    for command_name in \
        awk \
        chmod \
        cksum \
        cp \
        dirname \
        find \
        gzip \
        mkdir \
        mktemp \
        mv \
        readlink \
        rm \
        rmdir \
        sed \
        sh \
        sort \
        tar
    do
        link_required_command "$fake_dir" "$command_name"
    done
}

run_upgrade() {
    install_root=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$install_root/bin/cr" upgrade "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

run_upgrade_with_env() {
    install_root=$1
    install_dir_override=$2
    run_dir=$3
    shift 3

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    (
        cd "$run_dir" &&
            CODERAIL_INSTALL_DIR=$install_dir_override "$install_root/bin/cr" upgrade "$@"
    ) > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

run_upgrade_cwd_option() {
    install_root=$1
    work_dir=$2

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$install_root/bin/cr" --cwd "$work_dir" upgrade > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

run_upgrade_symlink() {
    install_root=$1
    link_path=$2

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    ln -s "$install_root/bin/cr" "$link_path"

    set +e
    "$link_path" upgrade > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

assert_upgrade_succeeds() {
    label=$1
    expected_url=$2
    shift 2
    install_root=$tmp_dir/install-$label
    archive_file=$tmp_dir/$label.tar.gz
    fake_dir=$tmp_dir/fake-$label
    fake_log=$tmp_dir/$label.log

    create_cli_install "$install_root"
    mkdir "$fake_dir"
    : > "$fake_log"
    create_archive "$archive_file" "$label"
    write_fake_curl "$fake_dir"

    FAKE_LOG=$fake_log FAKE_ARCHIVE=$archive_file PATH="$fake_dir:$PATH" \
        run_upgrade "$install_root" "$@"

    assert_status "$run_status" 0
    assert_contains "$fake_log" "curl $expected_url"
    assert_contains "$install_root/README.md" "readme $label"
    assert_executable "$install_root/bin/cr"
    assert_file "$install_root/.coderail-install"
    assert_contains "$install_root/.coderail-install" "README.md"
    assert_contains "$install_root/.coderail-install" "bin/cr"
}

assert_default_target() {
    assert_upgrade_succeeds default \
        https://github.com/pavelmudroch/coderail/archive/refs/tags/latest.tar.gz
}

assert_version_targets() {
    assert_upgrade_succeeds version-space \
        https://github.com/pavelmudroch/coderail/archive/refs/tags/v1.2.3.tar.gz \
        --version 1.2.3
    assert_upgrade_succeeds version-equals \
        https://github.com/pavelmudroch/coderail/archive/refs/tags/v1.2.3.tar.gz \
        --version=1.2.3
    assert_upgrade_succeeds version-prefixed \
        https://github.com/pavelmudroch/coderail/archive/refs/tags/v1.2.3.tar.gz \
        --version v1.2.3
}

assert_canary_target() {
    assert_upgrade_succeeds canary \
        https://github.com/pavelmudroch/coderail/archive/refs/heads/main.tar.gz \
        --canary
}

assert_force_replaces_modified_file() {
    install_root=$tmp_dir/install-force
    archive_file=$tmp_dir/force.tar.gz
    fake_dir=$tmp_dir/fake-force
    fake_log=$tmp_dir/force.log

    create_cli_install "$install_root"
    printf 'modified\n' >> "$install_root/bin/cr"
    mkdir "$fake_dir"
    : > "$fake_log"
    create_archive "$archive_file" force
    write_fake_curl "$fake_dir"

    FAKE_LOG=$fake_log FAKE_ARCHIVE=$archive_file PATH="$fake_dir:$PATH" \
        run_upgrade "$install_root" --force

    assert_status "$run_status" 0
    assert_contains "$fake_log" "curl https://github.com/pavelmudroch/coderail/archive/refs/tags/latest.tar.gz"
    assert_contains "$install_root/bin/cr" "force"
    assert_not_contains "$install_root/bin/cr" "modified"
}

assert_wget_fallback_applies_upgrade() {
    install_root=$tmp_dir/install-wget
    archive_file=$tmp_dir/wget.tar.gz
    fake_dir=$tmp_dir/fake-wget
    fake_log=$tmp_dir/wget.log

    create_cli_install "$install_root"
    mkdir "$fake_dir"
    : > "$fake_log"
    create_archive "$archive_file" wget
    write_fake_wget "$fake_dir"
    link_upgrade_runtime_commands "$fake_dir"

    FAKE_LOG=$fake_log FAKE_ARCHIVE=$archive_file PATH="$fake_dir" \
        run_upgrade "$install_root"

    assert_status "$run_status" 0
    assert_contains "$fake_log" "wget https://github.com/pavelmudroch/coderail/archive/refs/tags/latest.tar.gz"
    assert_contains "$install_root/README.md" "readme wget"
    assert_executable "$install_root/bin/cr"
}

assert_invalid_archive_layout_fails() {
    install_root=$tmp_dir/install-invalid-layout
    archive_file=$tmp_dir/invalid-layout.tar.gz
    invalid_parent=$tmp_dir/invalid-layout
    fake_dir=$tmp_dir/fake-invalid-layout
    fake_log=$tmp_dir/invalid-layout.log

    create_cli_install "$install_root"
    mkdir -p "$invalid_parent/one" "$invalid_parent/two"
    mkdir "$fake_dir"
    : > "$fake_log"
    (
        cd "$invalid_parent" &&
            tar -czf "$archive_file" one two
    )
    write_fake_curl "$fake_dir"

    FAKE_LOG=$fake_log FAKE_ARCHIVE=$archive_file PATH="$fake_dir:$PATH" \
        run_upgrade "$install_root"

    assert_status "$run_status" 1
    assert_contains "$fake_log" "curl https://github.com/pavelmudroch/coderail/archive/refs/tags/latest.tar.gz"
    assert_executable "$install_root/bin/cr"
    assert_path_missing "$install_root/README.md"
}

assert_usage_failure() {
    label=$1
    shift
    install_root=$tmp_dir/install-$label
    archive_file=$tmp_dir/$label.tar.gz
    fake_dir=$tmp_dir/fake-$label
    fake_log=$tmp_dir/$label.log

    create_cli_install "$install_root"
    mkdir "$fake_dir"
    : > "$fake_log"
    create_archive "$archive_file" "$label"
    write_fake_curl "$fake_dir"

    FAKE_LOG=$fake_log FAKE_ARCHIVE=$archive_file PATH="$fake_dir:$PATH" \
        run_upgrade "$install_root" "$@"

    assert_status "$run_status" 2
    assert_file_empty "$fake_log"
    assert_contains "$run_stderr" "Usage:"
}

assert_duplicate_options_fail() {
    assert_usage_failure duplicate-version --version 1.2.3 --version 1.2.4
    assert_usage_failure duplicate-canary --canary --canary
    assert_usage_failure duplicate-force --force --force
}

assert_conflicting_options_fail() {
    assert_usage_failure conflict-version-canary --version 1.2.3 --canary
    assert_usage_failure conflict-canary-version --canary --version 1.2.3
}

assert_unexpected_arguments_fail() {
    assert_usage_failure unexpected-arg latest
    assert_usage_failure unknown-option --latest
}

assert_invalid_versions_fail() {
    assert_usage_failure empty-version-equals --version=
    assert_usage_failure missing-version --version
    assert_usage_failure invalid-version-short --version 1.2
    assert_usage_failure invalid-version-main --version main
    assert_usage_failure invalid-version-prerelease --version v1.2.3-beta
    assert_usage_failure invalid-version-build --version v1.2.3+1
    assert_usage_failure invalid-version-branch --version feature
    assert_usage_failure invalid-version-hash --version deadbeef
}

assert_install_root_from_running_cli() {
    install_root=$tmp_dir/install-root
    override_root=$tmp_dir/override-root
    outside_dir=$tmp_dir/outside
    archive_file=$tmp_dir/root.tar.gz
    fake_dir=$tmp_dir/fake-root
    fake_log=$tmp_dir/root.log

    create_cli_install "$install_root"
    mkdir "$override_root"
    mkdir "$outside_dir"
    mkdir "$fake_dir"
    : > "$fake_log"
    create_archive "$archive_file" root
    write_fake_curl "$fake_dir"

    FAKE_LOG=$fake_log FAKE_ARCHIVE=$archive_file PATH="$fake_dir:$PATH" \
        run_upgrade_with_env "$install_root" "$override_root" "$outside_dir"

    assert_status "$run_status" 0
    assert_contains "$install_root/README.md" "readme root"
    assert_path_missing "$override_root/bin/cr"
    assert_path_missing "$outside_dir/bin/cr"
}

assert_symlinked_cli_uses_resolved_root() {
    install_root=$tmp_dir/install-symlink
    link_path=$tmp_dir/cr-link
    archive_file=$tmp_dir/symlink.tar.gz
    fake_dir=$tmp_dir/fake-symlink
    fake_log=$tmp_dir/symlink.log

    create_cli_install "$install_root"
    mkdir "$fake_dir"
    : > "$fake_log"
    create_archive "$archive_file" symlink
    write_fake_curl "$fake_dir"

    FAKE_LOG=$fake_log FAKE_ARCHIVE=$archive_file PATH="$fake_dir:$PATH" \
        run_upgrade_symlink "$install_root" "$link_path"

    assert_status "$run_status" 0
    assert_contains "$install_root/README.md" "readme symlink"
    assert_path_missing "$tmp_dir/README.md"
}

assert_cwd_rejected_for_upgrade() {
    install_root=$tmp_dir/install-cwd
    work_dir=$tmp_dir/work-cwd
    fake_dir=$tmp_dir/fake-cwd
    fake_log=$tmp_dir/cwd.log

    create_cli_install "$install_root"
    mkdir "$work_dir"
    mkdir "$fake_dir"
    : > "$fake_log"
    write_fake_curl "$fake_dir"

    FAKE_LOG=$fake_log FAKE_ARCHIVE=$tmp_dir/missing.tar.gz PATH="$fake_dir:$PATH" \
        run_upgrade_cwd_option "$install_root" "$work_dir"

    assert_status "$run_status" 2
    assert_file_empty "$fake_log"
    assert_contains "$run_stderr" "--cwd is not valid for upgrade"
}

assert_help_documents_supported_options() {
    install_root=$tmp_dir/install-help

    create_cli_install "$install_root"
    run_upgrade "$install_root" --help

    assert_status "$run_status" 0
    assert_contains "$run_stdout" "Default upgrade target is latest"
    assert_contains "$run_stdout" "--version X.Y.Z"
    assert_contains "$run_stdout" "--version vX.Y.Z"
    assert_contains "$run_stdout" "--canary"
    assert_contains "$run_stdout" "--force"
    assert_contains "$run_stdout" "Mutually exclusive with --version"
    assert_not_contains "$run_stdout" "--cwd"
    assert_file_empty "$run_stderr"
}

print_tests_header "Upgrade Command Tests"
test "Default target uses latest" assert_default_target
test "Version targets normalize to tags" assert_version_targets
test "Canary target uses main" assert_canary_target
test "Force replaces modified managed file" assert_force_replaces_modified_file
test "Wget fallback applies upgrade" assert_wget_fallback_applies_upgrade
test "Invalid archive layout fails" assert_invalid_archive_layout_fails
test "Duplicate options fail" assert_duplicate_options_fail
test "Conflicting options fail" assert_conflicting_options_fail
test "Unexpected arguments fail" assert_unexpected_arguments_fail
test "Invalid versions fail" assert_invalid_versions_fail
test "Install root comes from running CLI" assert_install_root_from_running_cli
test "Symlinked CLI uses resolved root" assert_symlinked_cli_uses_resolved_root
test "Cwd is rejected for upgrade" assert_cwd_rejected_for_upgrade
test "Help documents supported options" assert_help_documents_supported_options

print_tests_summary

if some_tests_failed; then
    exit 1
fi

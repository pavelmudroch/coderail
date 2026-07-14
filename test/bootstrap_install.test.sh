#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

PROJECT_ROOT=$(
    CDPATH= cd -- "$SCRIPT_DIR/.."
    pwd
)

INSTALL=$PROJECT_ROOT/INSTALL
TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-bootstrap-install-test.XXXXXX")

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

assert_status() {
    actual_status=$1
    expected_status=$2

    [ "$actual_status" -eq "$expected_status" ] ||
        fail "expected status $expected_status, got $actual_status"
}

create_source_tree() {
    source_root=$1
    label=$2

    mkdir -p "$source_root/bin"
    mkdir -p "$source_root/lib/commands"
    mkdir -p "$source_root/lib/utils"
    mkdir -p "$source_root/instructions/skills/example"
    mkdir -p "$source_root/test"

    cat > "$source_root/bin/cr" <<EOF
#!/usr/bin/env sh
echo "$label"
EOF
    chmod 644 "$source_root/bin/cr"

    printf 'command %s\n' "$label" > "$source_root/lib/commands/example.sh"
    cp "$PROJECT_ROOT/lib/utils/archive_apply.sh" "$source_root/lib/utils/archive_apply.sh"
    cp "$PROJECT_ROOT/lib/utils/log.sh" "$source_root/lib/utils/log.sh"
    printf 'skill %s\n' "$label" > "$source_root/instructions/skills/example/SKILL.md"
    printf 'readme %s\n' "$label" > "$source_root/README.md"
    printf 'changelog %s\n' "$label" > "$source_root/CHANGELOG.md"
    printf 'license %s\n' "$label" > "$source_root/LICENSE"
    cp "$INSTALL" "$source_root/INSTALL"

    printf 'config should not be copied\n' > "$source_root/config.ini"
    printf 'test should not be copied\n' > "$source_root/test/example.test.sh"
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

create_invalid_archive() {
    archive_file=$1
    archive_parent=$tmp_dir/archive-invalid
    archive_root=$archive_parent/coderail-invalid

    mkdir -p "$archive_root/bin"
    mkdir -p "$archive_root/lib/utils"
    mkdir -p "$archive_root/instructions"
    printf 'binary\n' > "$archive_root/bin/cr"
    cp "$PROJECT_ROOT/lib/utils/archive_apply.sh" "$archive_root/lib/utils/archive_apply.sh"
    cp "$PROJECT_ROOT/lib/utils/log.sh" "$archive_root/lib/utils/log.sh"
    printf 'readme\n' > "$archive_root/README.md"
    printf 'changelog\n' > "$archive_root/CHANGELOG.md"
    printf 'license\n' > "$archive_root/LICENSE"

    (
        cd "$archive_parent" &&
            tar -czf "$archive_file" coderail-invalid
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
    command_path=$(command -v "$command_name") ||
        fail "missing required command: $command_name"

    ln -s "$command_path" "$fake_dir/$command_name"
}

link_bootstrap_commands() {
    fake_dir=$1

    for command_name in awk tar gzip mktemp rm mkdir find sort cp chmod cksum sed dirname cat mv; do
        link_required_command "$fake_dir" "$command_name"
    done
}

assert_installed_tree() {
    install_root=$1

    assert_dir "$install_root"
    assert_file "$install_root/bin/cr"
    assert_executable "$install_root/bin/cr"
    assert_file "$install_root/lib/utils/archive_apply.sh"
    assert_file "$install_root/lib/utils/log.sh"
    assert_file "$install_root/instructions/skills/example/SKILL.md"
    assert_file "$install_root/README.md"
    assert_file "$install_root/CHANGELOG.md"
    assert_file "$install_root/LICENSE"
    assert_file "$install_root/INSTALL"
    assert_file "$install_root/.coderail-install"
    assert_contains "$install_root/.coderail-install" "bin/cr"
    assert_contains "$install_root/.coderail-install" "lib/utils/archive_apply.sh"
    assert_contains "$install_root/.coderail-install" "lib/utils/log.sh"
    assert_contains "$install_root/.coderail-install" "INSTALL"
    assert_not_contains "$install_root/.coderail-install" "config.ini"
    assert_path_missing "$install_root/config.ini"
    assert_path_missing "$install_root/test"
}

assert_default_install_uses_latest() {
    home_dir=$tmp_dir/home-default
    archive_file=$tmp_dir/default.tar.gz
    fake_dir=$tmp_dir/fake-default
    fake_log=$tmp_dir/default.log
    stdout_file=$tmp_dir/default.out
    install_root=$home_dir/.coderail

    mkdir "$home_dir"
    mkdir "$fake_dir"
    : > "$fake_log"
    create_archive "$archive_file" default
    write_fake_curl "$fake_dir"

    HOME=$home_dir FAKE_LOG=$fake_log FAKE_ARCHIVE=$archive_file PATH="$fake_dir:$PATH" \
        sh "$INSTALL" > "$stdout_file"

    assert_installed_tree "$install_root"
    assert_contains "$fake_log" "curl https://github.com/pavelmudroch/coderail/archive/refs/tags/latest.tar.gz"
    assert_contains "$stdout_file" "Coderail installed to: $install_root"
    assert_contains "$stdout_file" "export PATH=\"$install_root/bin:\$PATH\""
}

assert_custom_install_dir() {
    home_dir=$tmp_dir/home-custom
    install_root=$tmp_dir/custom-install
    archive_file=$tmp_dir/custom.tar.gz
    fake_dir=$tmp_dir/fake-custom
    fake_log=$tmp_dir/custom.log

    mkdir "$home_dir"
    mkdir "$fake_dir"
    : > "$fake_log"
    create_archive "$archive_file" custom
    write_fake_curl "$fake_dir"

    HOME=$home_dir CODERAIL_INSTALL_DIR=$install_root \
        FAKE_LOG=$fake_log FAKE_ARCHIVE=$archive_file PATH="$fake_dir:$PATH" \
        sh "$INSTALL" >/dev/null

    assert_installed_tree "$install_root"
    assert_path_missing "$home_dir/.coderail"
}

assert_install_version_url() {
    install_version=$1
    expected_url=$2
    label=$3
    install_root=$tmp_dir/install-$label
    archive_file=$tmp_dir/$label.tar.gz
    fake_dir=$tmp_dir/fake-$label
    fake_log=$tmp_dir/$label.log

    mkdir "$fake_dir"
    : > "$fake_log"
    create_archive "$archive_file" "$label"
    write_fake_curl "$fake_dir"

    CODERAIL_INSTALL_DIR=$install_root CODERAIL_INSTALL_VERSION=$install_version \
        FAKE_LOG=$fake_log FAKE_ARCHIVE=$archive_file PATH="$fake_dir:$PATH" \
        sh "$INSTALL" >/dev/null

    assert_installed_tree "$install_root"
    assert_contains "$fake_log" "curl $expected_url"
}

assert_version_selection() {
    assert_install_version_url main \
        https://github.com/pavelmudroch/coderail/archive/refs/heads/main.tar.gz \
        version-main
    assert_install_version_url 1.2.3 \
        https://github.com/pavelmudroch/coderail/archive/refs/tags/v1.2.3.tar.gz \
        version-semver
    assert_install_version_url v1.2.3 \
        https://github.com/pavelmudroch/coderail/archive/refs/tags/v1.2.3.tar.gz \
        version-vsemver
}

assert_invalid_versions_fail() {
    home_dir=$tmp_dir/home-invalid-version
    stdout_file=$tmp_dir/invalid-version.out
    stderr_file=$tmp_dir/invalid-version.err

    mkdir "$home_dir"

    set +e
    HOME=$home_dir CODERAIL_INSTALL_VERSION=feature \
        sh "$INSTALL" > "$stdout_file" 2> "$stderr_file"
    status=$?
    set -e

    assert_status "$status" 2
    assert_contains "$stderr_file" "unsupported CODERAIL_INSTALL_VERSION: feature"
    assert_path_missing "$home_dir/.coderail"

    set +e
    HOME=$home_dir CODERAIL_INSTALL_VERSION= \
        sh "$INSTALL" > "$stdout_file" 2> "$stderr_file"
    status=$?
    set -e

    assert_status "$status" 2
    assert_contains "$stderr_file" "CODERAIL_INSTALL_VERSION must not be empty"
    assert_path_missing "$home_dir/.coderail"
}

assert_unexpected_argument_fails() {
    home_dir=$tmp_dir/home-unexpected-argument
    stderr_file=$tmp_dir/unexpected-argument.err

    mkdir "$home_dir"

    set +e
    HOME=$home_dir sh "$INSTALL" --help >/dev/null 2> "$stderr_file"
    status=$?
    set -e

    assert_status "$status" 2
    assert_contains "$stderr_file" "unexpected argument: --help"
    assert_path_missing "$home_dir/.coderail"
}

assert_wget_fallback() {
    install_root=$tmp_dir/install-wget
    archive_file=$tmp_dir/wget.tar.gz
    fake_dir=$tmp_dir/fake-wget
    fake_log=$tmp_dir/wget.log

    mkdir "$fake_dir"
    : > "$fake_log"
    create_archive "$archive_file" wget
    write_fake_wget "$fake_dir"
    link_bootstrap_commands "$fake_dir"

    CODERAIL_INSTALL_DIR=$install_root CODERAIL_INSTALL_VERSION=main \
        FAKE_LOG=$fake_log FAKE_ARCHIVE=$archive_file PATH="$fake_dir" \
        /bin/sh "$INSTALL" >/dev/null

    assert_installed_tree "$install_root"
    assert_contains "$fake_log" "wget https://github.com/pavelmudroch/coderail/archive/refs/heads/main.tar.gz"
}

assert_missing_downloader_fails() {
    install_root=$tmp_dir/install-no-downloader
    fake_dir=$tmp_dir/fake-no-downloader
    stderr_file=$tmp_dir/no-downloader.err

    mkdir "$fake_dir"
    link_bootstrap_commands "$fake_dir"

    set +e
    CODERAIL_INSTALL_DIR=$install_root PATH="$fake_dir" \
        /bin/sh "$INSTALL" >/dev/null 2> "$stderr_file"
    status=$?
    set -e

    assert_status "$status" 1
    assert_contains "$stderr_file" "curl or wget is required"
    assert_path_missing "$install_root"
}

assert_invalid_archive_layout_fails() {
    install_root=$tmp_dir/install-invalid-archive
    archive_file=$tmp_dir/invalid.tar.gz
    fake_dir=$tmp_dir/fake-invalid-archive
    fake_log=$tmp_dir/invalid-archive.log
    stderr_file=$tmp_dir/invalid-archive.err

    mkdir "$fake_dir"
    : > "$fake_log"
    create_invalid_archive "$archive_file"
    write_fake_curl "$fake_dir"

    set +e
    CODERAIL_INSTALL_DIR=$install_root \
        FAKE_LOG=$fake_log FAKE_ARCHIVE=$archive_file PATH="$fake_dir:$PATH" \
        sh "$INSTALL" >/dev/null 2> "$stderr_file"
    status=$?
    set -e

    assert_status "$status" 1
    assert_contains "$stderr_file" "source root is missing INSTALL"
    assert_path_missing "$install_root/bin/cr"
}

assert_existing_empty_target_succeeds() {
    install_root=$tmp_dir/install-empty-target
    archive_file=$tmp_dir/empty-target.tar.gz
    fake_dir=$tmp_dir/fake-empty-target
    fake_log=$tmp_dir/empty-target.log

    mkdir "$install_root"
    mkdir "$fake_dir"
    : > "$fake_log"
    create_archive "$archive_file" empty-target
    write_fake_curl "$fake_dir"

    CODERAIL_INSTALL_DIR=$install_root \
        FAKE_LOG=$fake_log FAKE_ARCHIVE=$archive_file PATH="$fake_dir:$PATH" \
        sh "$INSTALL" >/dev/null

    assert_installed_tree "$install_root"
}

assert_non_empty_target_rejected() {
    install_root=$tmp_dir/install-non-empty
    archive_file=$tmp_dir/non-empty.tar.gz
    fake_dir=$tmp_dir/fake-non-empty
    fake_log=$tmp_dir/non-empty.log
    stderr_file=$tmp_dir/non-empty.err

    mkdir "$install_root"
    mkdir "$fake_dir"
    : > "$fake_log"
    printf 'user config\n' > "$install_root/config.ini"
    create_archive "$archive_file" non-empty
    write_fake_curl "$fake_dir"

    set +e
    CODERAIL_INSTALL_DIR=$install_root \
        FAKE_LOG=$fake_log FAKE_ARCHIVE=$archive_file PATH="$fake_dir:$PATH" \
        sh "$INSTALL" >/dev/null 2> "$stderr_file"
    status=$?
    set -e

    assert_status "$status" 1
    assert_contains "$stderr_file" "install directory is not empty: $install_root"
    assert_contains "$install_root/config.ini" "user config"
    [ ! -s "$fake_log" ] || fail "non-empty install target should not download"
}

print_tests_header "Bootstrap Install Tests"
test "Default install directory uses latest" assert_default_install_uses_latest
test "Custom install directory" assert_custom_install_dir
test "Install version selection" assert_version_selection
test "Invalid versions fail" assert_invalid_versions_fail
test "Unexpected argument fails" assert_unexpected_argument_fails
test "Download falls back to wget" assert_wget_fallback
test "Missing downloader fails" assert_missing_downloader_fails
test "Invalid archive layout fails" assert_invalid_archive_layout_fails
test "Existing empty target succeeds" assert_existing_empty_target_succeeds
test "Existing non-empty target is rejected" assert_non_empty_target_rejected

print_tests_summary

if some_tests_failed; then
    exit 1
fi

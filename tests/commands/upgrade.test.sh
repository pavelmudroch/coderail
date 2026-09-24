#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd "$SCRIPT_DIR/../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"

_test_public_upgrade_handoff()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    mkdir -p "$fixture_root/mock/lib/utils" "$fixture_root/work"
    capture_file="$fixture_root/captured"
    export capture_file
    acquisition_file="$fixture_root/acquisition"

    printf '%s\n' \
        'gh_download_release() { printf "%s\\n" "$1" > "$acquisition_file"; : > "$2"; }' \
        'gh_download_branch() { printf "%s\\n" "$1" > "$acquisition_file"; : > "$2"; }' \
        'gh_get_release_tags() { :; }' > "$fixture_root/mock/lib/utils/gh.sh"

    . "$PROJECT_ROOT/lib/commands/upgrade.sh"
    _CR_INSTALL_DIR="$fixture_root/mock"
    _CR_ERROR_EXIT_CODE=1
    _CR_USAGE_EXIT_CODE=2
    _CR_SUCCESS_EXIT_CODE=0
    coderail_version=0.0.0
    log_error() { :; }
    log_verbose() { :; }
    output() { :; }
    log_warning() { :; }
    fs_create_temp_dir() { printf '%s\n' "$fixture_root/work"; }
    path_locate_executable() { printf '%s\n' "$_CR_INSTALL_DIR/bin/cr"; }
    tar()
    {
        mkdir -p "$fixture_root/work/release/bin"
        printf '%s\n' \
            '#!/usr/bin/env sh' \
            '{' \
            'printf "%s\\n" arguments' \
            'printf "%s\\n" "$@"' \
            'printf "internal=%s\\n" "$CODERAIL_INTERNAL_INSTALL"' \
            'printf "source=%s\\n" "$CODERAIL_INTERNAL_SOURCE"' \
            'printf "destination=%s\\n" "$CODERAIL_INTERNAL_DESTINATION"' \
            'printf "origin=%s\\n" "$CODERAIL_INTERNAL_ORIGIN"' \
            '} > "$capture_file"' > "$fixture_root/work/release/bin/cr"
        chmod +x "$fixture_root/work/release/bin/cr"
    }

    execute_command "$@" || exit 1

    expected_capture=$(
        printf '%s\n' arguments upgrade
        for expected_argument do
            case "$expected_argument" in
                --force|--yes) printf '%s\n' "$expected_argument" ;;
            esac
        done
        printf 'internal=1\nsource=%s\ndestination=%s\norigin=upgrade\n' \
            "$fixture_root/work/release" "$fixture_root/mock"
    )
    [ "$(cat "$capture_file")" = "$expected_capture" ] || exit 1
    expected_acquisition=latest
    if [ "${1-}" = "--canary" ]; then
        expected_acquisition=main
    fi
    [ "$(cat "$acquisition_file")" = "$expected_acquisition" ] || exit 1
)

_test_install_bootstrap_handoff()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    mkdir -p "$fixture_root/bin"
    capture_file="$fixture_root/captured"
    export capture_file

    TARGET_TEMPLATE="$fixture_root/target-cr"
    export TARGET_TEMPLATE
    printf '%s\n' \
        '#!/usr/bin/env sh' \
        '{' \
        'printf "%s\n" arguments' \
        'printf "%s\n" "$@"' \
        'printf "internal=%s\n" "$CODERAIL_INTERNAL_INSTALL"' \
        'printf "source=%s\n" "$CODERAIL_INTERNAL_SOURCE"' \
        'printf "destination=%s\n" "$CODERAIL_INTERNAL_DESTINATION"' \
        'printf "origin=%s\n" "$CODERAIL_INTERNAL_ORIGIN"' \
        '} > "$capture_file"' > "$TARGET_TEMPLATE"
    chmod +x "$TARGET_TEMPLATE"

    printf '%s\n' \
        '#!/usr/bin/env sh' \
        'output_file=' \
        'while [ "$#" -gt 0 ]; do' \
        '    case "$1" in' \
        '        -o) shift; output_file=$1 ;;' \
        '    esac' \
        '    shift' \
        'done' \
        '[ -n "$output_file" ] || exit 1' \
        ': > "$output_file"' > "$fixture_root/bin/curl"
    chmod +x "$fixture_root/bin/curl"

    printf '%s\n' \
        '#!/usr/bin/env sh' \
        'destination=' \
        'while [ "$#" -gt 0 ]; do' \
        '    case "$1" in' \
        '        -C) shift; destination=$1 ;;' \
        '    esac' \
        '    shift' \
        'done' \
        '[ -n "$destination" ] || exit 1' \
        'mkdir -p "$destination/release/bin"' \
        'cp "$TARGET_TEMPLATE" "$destination/release/bin/cr"' \
        'chmod +x "$destination/release/bin/cr"' > "$fixture_root/bin/tar"
    chmod +x "$fixture_root/bin/tar"

    PATH="$fixture_root/bin:$PATH" \
        CODERAIL_INSTALL_DIR="$fixture_root/destination" \
        sh "$PROJECT_ROOT/install.sh" > "$fixture_root/install.out" 2> "$fixture_root/install.err" || exit 1

    expected_head=$(printf '%s\n' arguments upgrade --yes internal=1)
    [ "$(sed -n '1,4p' "$capture_file")" = "$expected_head" ] || exit 1
    source_root=$(sed -n 's/^source=//p' "$capture_file")
    case "$source_root" in
        */release) ;;
        *) exit 1 ;;
    esac
    grep -Fqx "destination=$fixture_root/destination" "$capture_file" || exit 1
    grep -Fqx 'origin=install' "$capture_file" || exit 1
)

print_tests_header "Upgrade Command Tests"

test "public upgrade forwards no overwrite flags to the extracted target" \
    _test_public_upgrade_handoff
test "public upgrade forwards force to the extracted target" \
    _test_public_upgrade_handoff --force
test "public upgrade forwards yes to the extracted target" \
    _test_public_upgrade_handoff --yes
test "public upgrade forwards force and yes to the extracted target" \
    _test_public_upgrade_handoff --force --yes
test "public canary upgrade downloads the main branch" \
    _test_public_upgrade_handoff --canary
test "bootstrap installation automatically confirms the private target" \
    _test_install_bootstrap_handoff

print_tests_summary

if some_tests_failed; then
    exit 1
fi

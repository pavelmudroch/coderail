#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"
. "$PROJECT_ROOT/lib/utils/gh.sh"

_test_fetch_file_rejects_http_errors()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    args_file="$fixture_root/curl-args"
    target_file="$fixture_root/archive.tar.gz"

    curl()
    {
        printf '%s\n' "$@" > "$args_file"
        printf 'HTTP 404\n' >&2
        return 22
    }

    cmd_name=curl
    log_verbose() { :; }

    if _fetch_file "https://example.test/archive.tar.gz" "$target_file" >/dev/null 2>&1; then
        exit 1
    fi

    expected_args=$(printf '%s\n' -fsSL 'https://example.test/archive.tar.gz' -o "$target_file")
    [ "$(cat "$args_file")" = "$expected_args" ]
)

_test_download_branch_uses_tarball_endpoint()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    url_file="$fixture_root/url"

    _fetch_file()
    {
        printf '%s\n' "$1" > "$url_file"
    }

    gh_download_branch main "$fixture_root/archive.tar.gz" || exit 1

    [ "$(cat "$url_file")" = \
        'https://github.com/pavelmudroch/coderail/archive/refs/heads/main.tar.gz' ]
)

print_tests_header "GitHub Utils Tests"

test "fetch file: curl rejects HTTP errors" _test_fetch_file_rejects_http_errors
test "download branch: uses the GitHub tarball endpoint" \
    _test_download_branch_uses_tarball_endpoint

print_tests_summary

if some_tests_failed; then
    exit 1
fi

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

_test_release_tags_separate_pages()
(
    log_verbose() { :; }
    _fetch_json()
    {
        case "$1" in
            *page=1) printf '%s\n' '{"tag_name":"v2.0.0"}' '{"tag_name":"v1.10.11"}' ;;
            *page=2) printf '%s\n' '{"tag_name":"v1.9.0"}' ;;
            *page=3) printf '%s\n' '[]' ;;
            *) return 1 ;;
        esac
    }

    actual=$(gh_get_release_tags) || exit 1
    expected=$(printf '%s\n' v2.0.0 v1.10.11 v1.9.0)
    [ "$actual" = "$expected" ]
)

_test_resolve_release_from_github_pages()
(
    log_verbose() { :; }
    _fetch_json()
    {
        case "$1" in
            "https://api.github.com/repos/pavelmudroch/coderail/releases?per_page=30&page=1")
                cat <<'EOF'
[
  {"tag_name": "v2.0.0"},
  {"tag_name": "v1.9.99"}
]
EOF
                ;;
            "https://api.github.com/repos/pavelmudroch/coderail/releases?per_page=30&page=2")
                cat <<'EOF'
[
  {"tag_name": "v1.10.11"},
  {"tag_name": "v1.11.0"},
  {"tag_name": "v1.100.0-rc.1"},
  {"tag_name": "latest"}
]
EOF
                ;;
            "https://api.github.com/repos/pavelmudroch/coderail/releases?per_page=30&page=3")
                printf '%s\n' '[]'
                ;;
            *) return 1 ;;
        esac
    }

    actual=$(gh_resolve_release_tag "$1") || exit 1
    [ "$actual" = "$2" ]
)

_test_resolve_release_tag()
(
    log_error() { :; }
    gh_get_release_tags()
    {
        printf '%s\n' v1.9.99 v2.0.0 1.10.2 v1.10.11 v11.0.0 \
            v1.100.0-rc.1 v1.100.0+build v01.100.0 main
    }

    if actual=$(gh_resolve_release_tag "$1"); then
        [ "$2" != fail ] && [ "$actual" = "$2" ]
    else
        [ "$2" = fail ] && [ -z "$actual" ]
    fi
)

_test_resolve_latest_release_tag()
(
    _fetch_json() { return 1; }
    gh_get_release_tags() { return 1; }

    actual=$(gh_resolve_release_tag "$1") || exit 1
    [ "$actual" = latest ]
)

_test_resolve_release_fetch_failure()
(
    gh_get_release_tags() { return 1; }
    _fetch_json() { return 1; }
    if actual=$(gh_resolve_release_tag "$1"); then
        exit 1
    fi
    [ -z "$actual" ]
)

_test_download_release_preserves_tag()
(
    _fetch_file()
    {
        [ "$1" = 'https://github.com/pavelmudroch/coderail/archive/refs/tags/v1.10.11.tar.gz' ]
    }
    gh_download_release v1.10.11 archive.tar.gz
)

print_tests_header "GitHub Utils Tests"

test "fetch file: curl rejects HTTP errors" _test_fetch_file_rejects_http_errors
test "download branch: uses the GitHub tarball endpoint" \
    _test_download_branch_uses_tarball_endpoint
test "release tags: pagination preserves tag boundaries" _test_release_tags_separate_pages
test "resolve release: major resolves real tags from paginated GitHub JSON" \
    _test_resolve_release_from_github_pages 1 v1.11.0
test "resolve release: minor resolves real tags from paginated GitHub JSON" \
    _test_resolve_release_from_github_pages 1.10 v1.10.11
test "resolve release: major selects highest stable version numerically" _test_resolve_release_tag 1 v1.10.11
test "resolve release: prefixed major selects highest stable version" _test_resolve_release_tag v1 v1.10.11
test "resolve release: minor selects highest patch" _test_resolve_release_tag 1.10 v1.10.11
test "resolve release: prefixed minor selects highest patch" _test_resolve_release_tag v1.10 v1.10.11
test "resolve release: exact version preserves tag prefix" _test_resolve_release_tag 1.10.11 v1.10.11
test "resolve release: prefixed selector preserves unprefixed tag" _test_resolve_release_tag v1.10.2 1.10.2
test "resolve release: unmatched major fails" _test_resolve_release_tag 3 fail
test "resolve release: unmatched minor fails" _test_resolve_release_tag 1.8 fail
test "resolve release: unmatched exact version fails" _test_resolve_release_tag 1.10.3 fail
test "resolve release: prerelease selector fails" _test_resolve_release_tag 1.100.0-rc.1 fail
test "resolve release: leading zeros fail" _test_resolve_release_tag 01 fail
test "resolve release: incomplete selector fails" _test_resolve_release_tag 1. fail
test "resolve release: extra component fails" _test_resolve_release_tag 1.2.3.4 fail
test "resolve release: arbitrary tag fails" _test_resolve_release_tag main fail
test "resolve release: latest preserves the moving tag without API calls" _test_resolve_latest_release_tag latest
test "resolve release: default preserves the moving tag without API calls" _test_resolve_latest_release_tag ''
test "resolve release: listing failure propagates" _test_resolve_release_fetch_failure 1
test "download release: preserves resolved tag" _test_download_release_preserves_tag

print_tests_summary

if some_tests_failed; then
    exit 1
fi

#!/usr/bin/env sh

cmd_name=""
GITHUB_API_VERSION="2026-03-10"
REPO="coderail"
OWNER="pavelmudroch"

if command -v curl >/dev/null 2>&1; then
    cmd_name="curl"
elif command -v wget >/dev/null 2>&1; then
    cmd_name="wget"
fi

gh_get_release_tags()
{
    per_page="30"
    page=1

    last_page=0
    tags=""
    while [ $last_page -eq 0 ]; do
        log_verbose "Fetching page $page of releases"
        url="https://api.github.com/repos/$OWNER/$REPO/releases?per_page=$per_page&page=$page"
        if ! response="$(_fetch_json "$url" 2>&1)"; then
            return 1
        fi
        page=$((page + 1))
        page_tags="$(printf "%s\n" "$response" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
        if [ -z "${page_tags-}" ]; then
            last_page=1
        else
            tags="${tags:+$tags
}$page_tags"
        fi
    done
    printf "%s\n" "$tags"
}

gh_resolve_release_tag()
{
    gh_release_selector=${1:-latest}
    if [ "$gh_release_selector" = latest ]; then
        printf '%s\n' latest
        return 0
    fi

    gh_release_selector=${gh_release_selector#v}
    if ! awk -v selector="$gh_release_selector" 'BEGIN {
        number = "(0|[1-9][0-9]*)"
        exit selector !~ ("^" number "(\\." number ")?(\\." number ")?$")
    }'; then
        log_error "Invalid release version: $1"
        return 1
    fi
    if ! gh_release_tags=$(gh_get_release_tags); then
        return 1
    fi
    printf '%s\n' "$gh_release_tags" | awk -v selector="$gh_release_selector" '
        BEGIN {
            count = split(selector, requested, ".")
            number = "(0|[1-9][0-9]*)"
            version_pattern = "^" number "\\." number "\\." number "$"
        }
        {
            version = $0
            sub(/^v/, "", version)
            if (version !~ version_pattern) next
            split(version, parts, ".")
            for (i = 1; i <= count; i++) {
                if (parts[i] + 0 != requested[i] + 0) break
            }
            if (i <= count) next
            if (tag == "" || parts[1] + 0 > major ||
                (parts[1] + 0 == major && parts[2] + 0 > minor) ||
                (parts[1] + 0 == major && parts[2] + 0 == minor && parts[3] + 0 > patch)) {
                tag = $0
                major = parts[1] + 0
                minor = parts[2] + 0
                patch = parts[3] + 0
            }
        }
        END {
            if (tag == "") exit 1
            print tag
        }
    '
}

gh_download_release()
{
    tag="$1"
    file="$2"

    url="https://github.com/$OWNER/$REPO/archive/refs/tags/$tag.tar.gz"
    if ! response="$(_fetch_file "$url" "$file" 2>&1)"; then
        return 1
    fi
}

gh_download_branch()
{
    branch="$1"
    file="$2"

    url="https://github.com/$OWNER/$REPO/archive/refs/heads/$branch.tar.gz"
    if ! response="$(_fetch_file "$url" "$file" 2>&1)"; then
        return 1
    fi
}

_fetch_file()
{
    url="$1"
    file="$2"

    case "$cmd_name" in
        curl)
            log_verbose "Using curl to fetch $url"
            curl -fsSL "$url" -o "$file" 2>&1
            ;;
        wget)
            log_verbose "Using wget to fetch $url"
            wget -qO "$file" "$url" 2>&1
            ;;
        *)
            exit 1
            ;;
    esac
}

_fetch_json()
{
    url="$1"

    case "$cmd_name" in
        curl)
            log_verbose "Using curl to fetch $url"
            curl -fsSL "$url" \
                -H "Accept: application/vnd.github+json" \
                -H "X-GitHub-Api-Version: $GITHUB_API_VERSION" 2>&1
            ;;
        wget)
            log_verbose "Using wget to fetch $url"
            wget -qO- "$url" \
                -H "Accept: application/vnd.github+json" \
                -H "X-GitHub-Api-Version: $GITHUB_API_VERSION" 2>&1
            ;;
        *)
            exit 1
            ;;
    esac
}

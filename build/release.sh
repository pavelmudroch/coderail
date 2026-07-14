#!/usr/bin/env sh

set -eu

script_path=$0

while [ -L "$script_path" ]; do
    script_dir=$(
        CDPATH= cd -- "$(dirname "$script_path")"
        pwd
    )
    link_target=$(readlink "$script_path")

    case "$link_target" in
        /*) script_path=$link_target ;;
        *) script_path=$script_dir/$link_target ;;
    esac
done

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$script_path")"
    pwd
)

ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/.."
    pwd
)

usage() {
    cat <<'EOF'
Usage:
  release.sh (--patch|--minor|--major)
  release.sh -h|--help

  Publish the next stable release.

Options:
  -h, --help            Show this help message and exit
  --patch               Validate the next patch release
  --minor               Validate the next minor release
  --major               Validate the next major release
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

fatal() {
    echo "error: $*" >&2
    exit 1
}

set_bump() {
    [ -z "$bump" ] || error "multiple bump flags provided"
    bump=$1
}

bump=

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || error "unexpected argument: $1"
            usage
            exit 0
            ;;
        --patch)
            set_bump patch
            shift
            ;;
        --minor)
            set_bump minor
            shift
            ;;
        --major)
            set_bump major
            shift
            ;;
        --*)
            error "unknown option: $1"
            ;;
        -*)
            error "unknown option: $1"
            ;;
        *)
            error "unexpected argument: $1"
            ;;
    esac
done

[ -n "$bump" ] || error "missing bump flag: expected one of --patch, --minor, or --major"

TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-release.XXXXXX")

cleanup() {
    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

local_tags_file=$tmp_dir/local-tags
remote_tags_file=$tmp_dir/remote-tags
remote_refs_file=$tmp_dir/remote-refs
all_tags_file=$tmp_dir/all-tags

write_local_tags() {
    git -C "$ROOT_DIR" tag --list > "$local_tags_file"
}

write_remote_tags() {
    if ! git -C "$ROOT_DIR" ls-remote --tags origin > "$remote_refs_file" 2>/dev/null; then
        fatal "unable to read release tags from origin"
    fi

    awk '
        {
            tag = $2
            sub(/^refs\/tags\//, "", tag)
            sub(/\^\{\}$/, "", tag)
            print tag
        }
    ' "$remote_refs_file" > "$remote_tags_file"
}

write_all_tags() {
    write_local_tags
    write_remote_tags

    cat "$local_tags_file" "$remote_tags_file" > "$all_tags_file"
}

read_declared_version() {
    declared_version=

    [ -f "$ROOT_DIR/lib/version.sh" ] || return 0

    declared_version=$(
        sed -n 's/^coderail_version="\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)"$/\1/p' \
            "$ROOT_DIR/lib/version.sh" |
            sed -n '1p'
    )
}

highest_release_version() {
    awk '
        /^v[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*$/ {
            split(substr($0, 2), version, ".")
            major = version[1] + 0
            minor = version[2] + 0
            patch = version[3] + 0

            if (!found ||
                major > highest_major ||
                (major == highest_major && minor > highest_minor) ||
                (major == highest_major && minor == highest_minor && patch > highest_patch)) {
                found = 1
                highest_major = major
                highest_minor = minor
                highest_patch = patch
            }
        }

        END {
            if (!found) {
                exit 1
            }

            printf "%d.%d.%d\n", highest_major, highest_minor, highest_patch
        }
    ' "$all_tags_file"
}

derive_target() {
    write_all_tags
    read_declared_version

    if ! previous_version=$(highest_release_version); then
        fatal "initial stable release tag required: create an existing vX.Y.Z tag first"
    fi

    previous_major=${previous_version%%.*}
    previous_rest=${previous_version#*.}
    previous_minor=${previous_rest%%.*}
    previous_patch=${previous_rest#*.}

    case "$bump" in
        patch)
            target_major=$previous_major
            target_minor=$previous_minor
            target_patch=$((previous_patch + 1))
            ;;
        minor)
            target_major=$previous_major
            target_minor=$((previous_minor + 1))
            target_patch=0
            ;;
        major)
            target_major=$((previous_major + 1))
            target_minor=0
            target_patch=0
            ;;
    esac

    target_version=$target_major.$target_minor.$target_patch
    target_tag=v$target_version

    if [ -n "$declared_version" ] && [ "$declared_version" = "$previous_version" ]; then
        declared_tag=v$declared_version

        if tag_exists_in_file "$declared_tag" "$local_tags_file"; then
            fatal "release metadata version already exists locally: $declared_tag; expected next version is $target_version"
        fi

        if tag_exists_in_file "$declared_tag" "$remote_tags_file"; then
            fatal "release metadata version already exists on origin: $declared_tag; expected next version is $target_version"
        fi
    fi
}

assert_main_branch() {
    branch=$(git -C "$ROOT_DIR" symbolic-ref --quiet --short HEAD 2>/dev/null || printf detached)

    [ "$branch" = main ] || fatal "current branch must be main before releasing; found $branch"
}

assert_clean_worktree() {
    [ -z "$(git -C "$ROOT_DIR" status --porcelain)" ] ||
        fatal "worktree must be clean before release validation"
}

tag_exists_in_file() {
    grep -Fx "$1" "$2" >/dev/null 2>&1
}

assert_target_tag_available() {
    if tag_exists_in_file "$target_tag" "$local_tags_file"; then
        fatal "derived version tag already exists locally: $target_tag"
    fi

    if tag_exists_in_file "$target_tag" "$remote_tags_file"; then
        fatal "derived version tag already exists on origin: $target_tag"
    fi
}

validate_repo_state() {
    assert_main_branch
    assert_clean_worktree
    assert_target_tag_available
}

assert_file_contains_line() {
    file=$1
    expected_line=$2
    error_message=$3

    [ -f "$ROOT_DIR/$file" ] || fatal "$error_message"
    grep -Fx "$expected_line" "$ROOT_DIR/$file" >/dev/null 2>&1 || fatal "$error_message"
}

validate_version_file() {
    assert_file_contains_line \
        lib/version.sh \
        "coderail_version=\"$target_version\"" \
        "expected lib/version.sh to contain coderail_version=\"$target_version\""
}

validate_changelog() {
    changelog=$ROOT_DIR/CHANGELOG.md
    release_link="[$target_tag]: https://github.com/pavelmudroch/coderail/releases/tag/$target_tag"
    unreleased_link="[Unreleased]: https://github.com/pavelmudroch/coderail/compare/$target_tag...HEAD"

    [ -f "$changelog" ] || fatal "expected CHANGELOG.md to document $target_tag"
    grep -F "## [$target_tag] - " "$changelog" >/dev/null 2>&1 ||
        fatal "expected CHANGELOG.md release section for $target_tag"
    grep -Fx "$release_link" "$changelog" >/dev/null 2>&1 ||
        fatal "expected CHANGELOG.md release link: $release_link"
    grep -Fx "$unreleased_link" "$changelog" >/dev/null 2>&1 ||
        fatal "expected CHANGELOG.md [Unreleased] link: $unreleased_link"
}

validate_metadata() {
    validate_version_file
    validate_changelog
}

capture_latest_state() {
    if previous_latest_ref=$(git -C "$ROOT_DIR" rev-parse -q --verify refs/tags/latest 2>/dev/null); then
        previous_latest_exists=true
    else
        previous_latest_exists=false
        previous_latest_ref=
    fi
}

rollback_release_tags() {
    rollback_failed=false

    if git -C "$ROOT_DIR" rev-parse -q --verify "refs/tags/$target_tag" >/dev/null; then
        if ! git -C "$ROOT_DIR" tag -d "$target_tag" >/dev/null 2>&1; then
            echo "error: failed to delete local release tag during rollback: $target_tag" >&2
            rollback_failed=true
        fi
    fi

    if [ "$previous_latest_exists" = true ]; then
        if ! git -C "$ROOT_DIR" update-ref refs/tags/latest "$previous_latest_ref"; then
            echo "error: failed to restore local latest tag during rollback" >&2
            rollback_failed=true
        fi
    elif git -C "$ROOT_DIR" rev-parse -q --verify refs/tags/latest >/dev/null; then
        if ! git -C "$ROOT_DIR" update-ref -d refs/tags/latest; then
            echo "error: failed to remove local latest tag during rollback" >&2
            rollback_failed=true
        fi
    fi

    [ "$rollback_failed" = false ] || fatal "rollback failed after release publish failure"
}

publish_release() {
    release_commit=$(git -C "$ROOT_DIR" rev-parse HEAD)

    capture_latest_state

    git -C "$ROOT_DIR" tag -a "$target_tag" "$release_commit" -m "release version $target_version"
    git -C "$ROOT_DIR" tag -f -a latest "$release_commit" -m "latest version pointer"

    if ! git -C "$ROOT_DIR" push --atomic origin \
        "refs/tags/$target_tag:refs/tags/$target_tag" \
        "+refs/tags/latest:refs/tags/latest"; then
        rollback_release_tags
        fatal "failed to push release tags to origin"
    fi
}

derive_target
validate_repo_state
validate_metadata
publish_release

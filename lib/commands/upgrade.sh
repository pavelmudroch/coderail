#!/usr/bin/env sh

usage()
{
    cat <<'EOF'
Usage:
  cr upgrade [options]

Options:
  --list            List all available versions for upgrade; cannot combine
                    with --canary or --version
  --version <tag>   Specify the version to upgrade to, if not specified,
                    upgrade to the latest release; use semantic version
                    specifier <major>.<minor>.<patch> w/wo a leading "v"
                    prefix; minor and patch numbers are optional, if omitted
                    use highest available for the omitted numbers
  --canary          Upgrade to the canary version
  --force           Allow overwriting existing edited instruction, or
                    template files; prompt for confirmation
  --yes             Automatically confirm the prompt
EOF
}

execute_command()
{
    . "$_CR_INSTALL_DIR/lib/utils/gh.sh"

    canary=0
    force=0
    yes=0
    list=0
    version=""

    while [ $# -gt 0 ]; do
        case "$1" in
            --list)
                list=1
                ;;
            --version)
                shift
                if [ -z "${1-}" ]; then
                    log_error "Missing argument for --version"
                    usage >&2
                    exit "$_CR_USAGE_EXIT_CODE"
                fi
                version="$1"
                ;;
            --version=*)
                version="${1#*=}"
                ;;
            --canary)
                canary=1
                ;;
            --force)
                force=1
                ;;
            --yes)
                yes=1
                ;;
            *)
                log_error "Unknown argument: $1"
                usage >&2
                exit "$_CR_USAGE_EXIT_CODE"
                ;;
        esac
        shift
    done

    if [ "$list" -eq 1 ]; then
        if [ "$canary" -eq 1 ] || [ -n "$version" ]; then
            log_error "Cannot use --list with --canary or --version"
            usage >&2
            exit "$_CR_USAGE_EXIT_CODE"
        fi

        if ! tag_list=$(gh_get_release_tags); then
            log_error "Failed to retrieve available versions"
            exit "$_CR_ERROR_EXIT_CODE"
        fi

        output "Available versions for upgrade:"
        while IFS= read -r tag; do
            if [ "v$coderail_version" = "$tag" ]; then
                output "* $(color_green "$tag") $(color_gray "(current)")"
            else
                output "  $tag"
            fi
        done <<EOF
${tag_list}
EOF
        return 0
    fi

    target_file="$(fs_create_temp_dir)/archive.tar.gz" || return 1
    if [ "$canary" -eq 1 ]; then
        if [ -n "$version" ]; then
            log_error "Cannot use --canary with --version"
            usage >&2
            exit "$_CR_USAGE_EXIT_CODE"
        fi

        if ! gh_download_branch "main" "$target_file"; then
            log_error "Failed to download canary version"
            exit "$_CR_ERROR_EXIT_CODE"
        fi
        return 0
    else
        version="${version:-latest}"
        version="${version#v}"
        if ! gh_download_release "$version" "$target_file"; then
            log_error "Failed to download release $version"
            exit "$_CR_ERROR_EXIT_CODE"
        fi
    fi
    # extrack archive and invoke cr upgrade from archive
}
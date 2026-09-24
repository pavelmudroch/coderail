#!/usr/bin/env sh

usage()
{
    cat <<'EOF'
Usage:
  cr upgrade [options]

Options:
  -h, --help            Show this help message and exit
      --list            List all available versions for upgrade; cannot
                        combine with --canary or --version
      --version <tag>   Specify the version to upgrade to, if not specified,
                        upgrade to the latest release; use semantic version
                        specifier <major>.<minor>.<patch> w/wo a leading "v"
                        prefix; minor and patch numbers are optional, if
                        omitted use highest available for the omitted numbers
      --canary          Upgrade to the canary version
      --force           Allow overwriting existing edited instruction, or
                        template files; prompt for confirmation
      --yes             Automatically confirm the prompt
EOF
}

execute_command()
{
    canary=0
    force=0
    yes=0
    list=0
    version=""

    while [ $# -gt 0 ]; do
        case "$1" in
            -h|--help)
                usage
                exit 0
                ;;
            --help=*)
                log_error "--help does not take an argument"
                usage >&2
                exit "$_CR_USAGE_EXIT_CODE"
                ;;
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

    if [ "${CODERAIL_INTERNAL_INSTALL:-}" = "1" ]; then
        . "$_CR_INSTALL_DIR/lib/commands/upgrade/internal_install.sh"
        _internal_install "$force" "$yes"
        return $?
    fi

    . "$_CR_INSTALL_DIR/lib/utils/gh.sh"

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

    temp_dir="$(fs_create_temp_dir)" || return 1
    target_file="$temp_dir/archive.tar.gz"
    if [ "$canary" -eq 1 ]; then
        if [ -n "$version" ]; then
            log_error "Cannot use --canary with --version"
            usage >&2
            exit "$_CR_USAGE_EXIT_CODE"
        fi

        log_verbose "Downloading canary version..."
        if ! gh_download_branch "main" "$target_file"; then
            log_error "Failed to download canary version"
            exit "$_CR_ERROR_EXIT_CODE"
        fi
    else
        version="${version:-latest}"
        version="${version#v}"

        log_verbose "Downloading release version $version..."
        if ! gh_download_release "$version" "$target_file"; then
            log_error "Failed to download release $version"
            exit "$_CR_ERROR_EXIT_CODE"
        fi
    fi

    log_verbose "Extracting archive..."
    if ! tar -xzf "$target_file" -C "$temp_dir"; then
        log_error "Failed to extract archive"
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    cr_source_dir=""
    for candidate in "$temp_dir"/*; do
        if [ -x "$candidate/bin/cr" ]; then
            cr_source_dir="$candidate"
            break
        fi
    done

    if [ -z "$cr_source_dir" ]; then
        log_error "Upgrade tool not found in the archive"
        exit "$_CR_ERROR_EXIT_CODE"
    fi
    cr_upgrade_tool="$cr_source_dir/bin/cr"

    log_verbose "Upgrading coderail..."
    set --
    if [ "$force" -eq 1 ]; then
        set -- "$@" --force
    fi
    if [ "$yes" -eq 1 ]; then
        set -- "$@" --yes
    fi
    if ! CODERAIL_INTERNAL_INSTALL=1 \
        CODERAIL_INTERNAL_SOURCE="$cr_source_dir" \
        CODERAIL_INTERNAL_DESTINATION="$_CR_INSTALL_DIR" \
        CODERAIL_INTERNAL_ORIGIN=upgrade \
        "$cr_upgrade_tool" upgrade "$@"; then
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! current_cr_executable=$(path_locate_executable "cr"); then
        message=$(printf "'cr' tool is not located in your PATH\nAdd $_CR_INSTALL_DIR/bin to your PATH or link it to a directory\nalready in your PATH\n")
        log_warning "$message"
        exit "$_CR_SUCCESS_EXIT_CODE"
    fi

    if [ "$current_cr_executable" != "$CODERAIL_INTERNAL_DESTINATION/bin/cr" ]; then
        message=$(printf "'cr' tool in your PATH (%s) does not match the installed location (%s)\n" "$current_cr_executable" "$CODERAIL_INTERNAL_DESTINATION/bin/cr")
        log_warning "$message"
    fi
}

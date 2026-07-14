#!/usr/bin/env sh

CODERAIL_ARCHIVE_REPO_URL=https://github.com/pavelmudroch/coderail

coderail_archive_load_log() {
    if command -v log_error >/dev/null 2>&1; then
        return 0
    fi

    coderail_archive_log_dir=$(
        CDPATH= cd -- "$(dirname "$0")"
        pwd
    ) || return 1

    if [ -f "$coderail_archive_log_dir/log.sh" ]; then
        . "$coderail_archive_log_dir/log.sh"
        return 0
    fi

    if [ -f "$coderail_archive_log_dir/lib/utils/log.sh" ]; then
        . "$coderail_archive_log_dir/lib/utils/log.sh"
        return 0
    fi

    printf 'error: log utility was not found\n' >&2
    return 1
}

coderail_archive_load_log || {
    return 1 2>/dev/null || exit 1
}

coderail_archive_error() {
    log_error "$@"
    return 1
}

coderail_archive_usage() {
    cat <<'EOF'
Usage:
  archive_apply.sh resolve-target <target>
  archive_apply.sh download-archive <target> <archive-file>
  archive_apply.sh extract-source <archive-file> <extract-dir>
  archive_apply.sh stage-source <source-root> <stage-dir> <manifest-file>
  archive_apply.sh validate-upgrade-install <install-root>
  archive_apply.sh apply-source <source-root> <install-root> <force>
  archive_apply.sh apply-target <target> <install-root> <force>
  archive_apply.sh upgrade-target <target> <install-root>
EOF
}

coderail_archive_usage_error() {
    log_error "$@"
    printf '\n' >&2
    coderail_archive_usage >&2
    return 2
}

coderail_archive_validate_force() {
    case "$1" in
        true|false)
            ;;
        *)
            coderail_archive_error "force must be true or false"
            ;;
    esac
}

coderail_archive_policy_from_force() {
    coderail_archive_validate_force "$1" || return 1

    if [ "$1" = true ]; then
        printf '%s\n' force
    else
        printf '%s\n' safe
    fi
}

coderail_archive_validate_policy() {
    case "$1" in
        safe|force|upgrade)
            ;;
        *)
            coderail_archive_error "archive policy must be safe, force, or upgrade"
            ;;
    esac
}

coderail_archive_is_release_version() {
    printf '%s\n' "$1" | awk '
        /^[v]?[0-9]+\.[0-9]+\.[0-9]+$/ { found = 1 }
        END { exit found ? 0 : 1 }
    '
}

coderail_archive_target_ref() {
    coderail_archive_target=$1

    case "$coderail_archive_target" in
        latest|main)
            printf '%s\n' "$coderail_archive_target"
            ;;
        "")
            coderail_archive_error "empty archive target"
            ;;
        *)
            if coderail_archive_is_release_version "$coderail_archive_target"; then
                case "$coderail_archive_target" in
                    v*) printf '%s\n' "$coderail_archive_target" ;;
                    *) printf 'v%s\n' "$coderail_archive_target" ;;
                esac
                return 0
            fi

            coderail_archive_error "unsupported archive target: $coderail_archive_target"
            ;;
    esac
}

coderail_archive_target_url() {
    coderail_archive_target_ref_value=$(coderail_archive_target_ref "$1") || return 1

    case "$coderail_archive_target_ref_value" in
        main)
            printf '%s/archive/refs/heads/main.tar.gz\n' "$CODERAIL_ARCHIVE_REPO_URL"
            ;;
        latest|v*)
            printf '%s/archive/refs/tags/%s.tar.gz\n' "$CODERAIL_ARCHIVE_REPO_URL" "$coderail_archive_target_ref_value"
            ;;
        *)
            coderail_archive_error "unsupported archive target: $coderail_archive_target_ref_value"
            ;;
    esac
}

coderail_archive_download_url() {
    coderail_archive_url=$1
    coderail_archive_file=$2

    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$coderail_archive_url" -o "$coderail_archive_file" ||
            coderail_archive_error "failed to download archive: $coderail_archive_url"
        return $?
    fi

    if command -v wget >/dev/null 2>&1; then
        wget -q -O "$coderail_archive_file" "$coderail_archive_url" ||
            coderail_archive_error "failed to download archive: $coderail_archive_url"
        return $?
    fi

    coderail_archive_error "curl or wget is required"
}

coderail_archive_download() {
    log_info "Downloading archive"
    log_notice "archive target: $1"
    log_notice "archive file: $2"

    coderail_archive_url=$(coderail_archive_target_url "$1") || return 1
    coderail_archive_download_url "$coderail_archive_url" "$2"
}

coderail_archive_validate_source_root() {
    coderail_archive_source_root=$1

    [ -d "$coderail_archive_source_root" ] ||
        coderail_archive_error "source root is not a directory: $coderail_archive_source_root" ||
        return 1
    [ -f "$coderail_archive_source_root/bin/cr" ] ||
        coderail_archive_error "source root is missing bin/cr" ||
        return 1
    [ -d "$coderail_archive_source_root/lib" ] ||
        coderail_archive_error "source root is missing lib/" ||
        return 1
    [ -d "$coderail_archive_source_root/instructions" ] ||
        coderail_archive_error "source root is missing instructions/" ||
        return 1
    [ -f "$coderail_archive_source_root/README.md" ] ||
        coderail_archive_error "source root is missing README.md" ||
        return 1
    [ -f "$coderail_archive_source_root/CHANGELOG.md" ] ||
        coderail_archive_error "source root is missing CHANGELOG.md" ||
        return 1
    [ -f "$coderail_archive_source_root/LICENSE" ] ||
        coderail_archive_error "source root is missing LICENSE" ||
        return 1
    [ -f "$coderail_archive_source_root/INSTALL" ] ||
        coderail_archive_error "source root is missing INSTALL" ||
        return 1
}

coderail_archive_extract_source_root() {
    coderail_archive_file=$1
    coderail_archive_extract_dir=$2

    [ -f "$coderail_archive_file" ] ||
        coderail_archive_error "archive file does not exist: $coderail_archive_file" ||
        return 1

    mkdir -p "$coderail_archive_extract_dir" || return 1
    tar -xzf "$coderail_archive_file" -C "$coderail_archive_extract_dir" ||
        coderail_archive_error "failed to extract archive: $coderail_archive_file" ||
        return 1

    coderail_archive_source_root=
    coderail_archive_root_count=0

    for coderail_archive_entry in \
        "$coderail_archive_extract_dir"/* \
        "$coderail_archive_extract_dir"/.[!.]* \
        "$coderail_archive_extract_dir"/..?*
    do
        [ -e "$coderail_archive_entry" ] || continue
        coderail_archive_root_count=$((coderail_archive_root_count + 1))

        [ -d "$coderail_archive_entry" ] ||
            coderail_archive_error "archive must contain one source directory" ||
            return 1
        coderail_archive_source_root=$coderail_archive_entry
    done

    [ "$coderail_archive_root_count" -eq 1 ] ||
        coderail_archive_error "archive must contain exactly one source directory" ||
        return 1

    coderail_archive_validate_source_root "$coderail_archive_source_root" || return 1
    printf '%s\n' "$coderail_archive_source_root"
}

coderail_archive_validate_manifest_path() {
    coderail_archive_rel_path=$1

    case "$coderail_archive_rel_path" in
        ""|/*|.|..|../*|*/..|*/../*|./*|*/./*|*/.)
            coderail_archive_error "invalid install manifest path: $coderail_archive_rel_path"
            ;;
    esac
}

coderail_archive_relative_path() {
    coderail_archive_path=$1
    coderail_archive_base=${2%/}

    case "$coderail_archive_path" in
        "$coderail_archive_base"/*)
            coderail_archive_rel_path=${coderail_archive_path#"$coderail_archive_base"/}
            coderail_archive_validate_manifest_path "$coderail_archive_rel_path" || return 1
            printf '%s\n' "$coderail_archive_rel_path"
            ;;
        *)
            coderail_archive_error "$coderail_archive_path is not under $coderail_archive_base"
            ;;
    esac
}

coderail_archive_managed_root_files() {
    printf '%s\n' README.md CHANGELOG.md LICENSE INSTALL
}

coderail_archive_copy_stage_file() {
    coderail_archive_source_file=$1
    coderail_archive_stage_dir=$2
    coderail_archive_rel_path=$3
    coderail_archive_target_file=$coderail_archive_stage_dir/$coderail_archive_rel_path

    coderail_archive_validate_manifest_path "$coderail_archive_rel_path" || return 1
    mkdir -p "$(dirname "$coderail_archive_target_file")" || return 1
    cp "$coderail_archive_source_file" "$coderail_archive_target_file" || return 1

    if [ "$coderail_archive_rel_path" = bin/cr ]; then
        chmod 755 "$coderail_archive_target_file" || return 1
    fi
}

coderail_archive_stage_managed_dir() {
    coderail_archive_source_root=$1
    coderail_archive_stage_dir=$2
    coderail_archive_rel_dir=$3
    coderail_archive_source_dir=$coderail_archive_source_root/$coderail_archive_rel_dir
    coderail_archive_list_file=$(mktemp "${TMPDIR:-/tmp}/coderail-archive-files.XXXXXX") || return 1
    coderail_archive_status=0

    [ -d "$coderail_archive_source_dir" ] ||
        coderail_archive_error "source root is missing $coderail_archive_rel_dir/" ||
        coderail_archive_status=1

    if [ "$coderail_archive_status" -eq 0 ]; then
        find "$coderail_archive_source_dir" -type f | sort > "$coderail_archive_list_file" ||
            coderail_archive_status=1
    fi

    while [ "$coderail_archive_status" -eq 0 ] &&
        IFS= read -r coderail_archive_source_file
    do
        coderail_archive_rel_path=$(
            coderail_archive_relative_path "$coderail_archive_source_file" "$coderail_archive_source_root"
        ) || {
            coderail_archive_status=1
            break
        }

        coderail_archive_copy_stage_file \
            "$coderail_archive_source_file" \
            "$coderail_archive_stage_dir" \
            "$coderail_archive_rel_path" ||
            coderail_archive_status=1
    done < "$coderail_archive_list_file"

    rm -f "$coderail_archive_list_file"
    return "$coderail_archive_status"
}

coderail_archive_stage_root_files() {
    coderail_archive_source_root=$1
    coderail_archive_stage_dir=$2

    coderail_archive_managed_root_files | while IFS= read -r coderail_archive_rel_path; do
        coderail_archive_source_file=$coderail_archive_source_root/$coderail_archive_rel_path
        [ -f "$coderail_archive_source_file" ] || continue

        coderail_archive_copy_stage_file \
            "$coderail_archive_source_file" \
            "$coderail_archive_stage_dir" \
            "$coderail_archive_rel_path" || exit 1
    done
}

coderail_archive_stage_source() {
    coderail_archive_source_root=$1
    coderail_archive_stage_dir=$2

    log_info "Staging source files"
    log_notice "source root: $coderail_archive_source_root"
    log_notice "stage directory: $coderail_archive_stage_dir"

    coderail_archive_validate_source_root "$coderail_archive_source_root" || return 1
    mkdir -p "$coderail_archive_stage_dir" || return 1

    coderail_archive_stage_managed_dir "$coderail_archive_source_root" "$coderail_archive_stage_dir" bin ||
        return 1
    coderail_archive_stage_managed_dir "$coderail_archive_source_root" "$coderail_archive_stage_dir" lib ||
        return 1
    coderail_archive_stage_managed_dir "$coderail_archive_source_root" "$coderail_archive_stage_dir" instructions ||
        return 1
    coderail_archive_stage_root_files "$coderail_archive_source_root" "$coderail_archive_stage_dir" ||
        return 1
}

coderail_archive_build_manifest() {
    coderail_archive_stage_dir=$1
    coderail_archive_manifest_file=$2
    coderail_archive_list_file=$(mktemp "${TMPDIR:-/tmp}/coderail-archive-files.XXXXXX") || return 1
    coderail_archive_status=0

    log_info "Building install manifest"
    log_notice "manifest file: $coderail_archive_manifest_file"

    : > "$coderail_archive_manifest_file" || {
        rm -f "$coderail_archive_list_file"
        return 1
    }

    find "$coderail_archive_stage_dir" -type f | sort > "$coderail_archive_list_file" ||
        coderail_archive_status=1

    while [ "$coderail_archive_status" -eq 0 ] &&
        IFS= read -r coderail_archive_stage_file
    do
        coderail_archive_rel_path=$(
            coderail_archive_relative_path "$coderail_archive_stage_file" "$coderail_archive_stage_dir"
        ) || {
            coderail_archive_status=1
            break
        }

        (
            cd "$coderail_archive_stage_dir" && cksum "$coderail_archive_rel_path"
        ) >> "$coderail_archive_manifest_file" || coderail_archive_status=1
    done < "$coderail_archive_list_file"

    rm -f "$coderail_archive_list_file"
    [ "$coderail_archive_status" -eq 0 ] || return 1
    coderail_archive_validate_manifest_file "$coderail_archive_manifest_file"
}

coderail_archive_manifest_path_from_line() {
    coderail_archive_manifest_line=$1
    coderail_archive_rel_path=$(
        printf '%s\n' "$coderail_archive_manifest_line" |
            sed 's/^[0-9][0-9]* [0-9][0-9]* //'
    )

    [ "$coderail_archive_rel_path" != "$coderail_archive_manifest_line" ] ||
        coderail_archive_error "invalid install manifest line: $coderail_archive_manifest_line" ||
        return 1

    coderail_archive_validate_manifest_path "$coderail_archive_rel_path" || return 1
    printf '%s\n' "$coderail_archive_rel_path"
}

coderail_archive_validate_manifest_file() {
    coderail_archive_manifest_file=$1

    [ -f "$coderail_archive_manifest_file" ] ||
        coderail_archive_error "install manifest does not exist: $coderail_archive_manifest_file" ||
        return 1

    while IFS= read -r coderail_archive_manifest_line ||
        [ -n "$coderail_archive_manifest_line" ]
    do
        [ -n "$coderail_archive_manifest_line" ] || continue
        coderail_archive_manifest_path_from_line "$coderail_archive_manifest_line" >/dev/null ||
            return 1
    done < "$coderail_archive_manifest_file"
}

coderail_archive_manifest_line_for_path() {
    coderail_archive_manifest_file=$1
    coderail_archive_rel_path=$2

    coderail_archive_validate_manifest_path "$coderail_archive_rel_path" || return 1
    [ -f "$coderail_archive_manifest_file" ] || return 1

    while IFS= read -r coderail_archive_manifest_line ||
        [ -n "$coderail_archive_manifest_line" ]
    do
        [ -n "$coderail_archive_manifest_line" ] || continue
        coderail_archive_current_path=$(
            coderail_archive_manifest_path_from_line "$coderail_archive_manifest_line"
        ) || return 1

        if [ "$coderail_archive_current_path" = "$coderail_archive_rel_path" ]; then
            printf '%s\n' "$coderail_archive_manifest_line"
            return 0
        fi
    done < "$coderail_archive_manifest_file"

    return 1
}

coderail_archive_manifest_path_exists() {
    coderail_archive_manifest_line_for_path "$1" "$2" >/dev/null 2>&1
}

coderail_archive_validate_upgrade_install() {
    coderail_archive_install_root=$1
    coderail_archive_manifest_file=$coderail_archive_install_root/.coderail-install

    [ -d "$coderail_archive_install_root" ] ||
        coderail_archive_error "upgrade install root is not a directory: $coderail_archive_install_root" ||
        return 1
    [ -f "$coderail_archive_manifest_file" ] ||
        coderail_archive_error "upgrade install manifest is not a regular file: $coderail_archive_manifest_file" ||
        return 1
    coderail_archive_validate_manifest_file "$coderail_archive_manifest_file" || return 1
    [ -s "$coderail_archive_manifest_file" ] ||
        coderail_archive_error "upgrade install manifest is empty: $coderail_archive_manifest_file" ||
        return 1
    coderail_archive_manifest_path_exists "$coderail_archive_manifest_file" bin/cr ||
        coderail_archive_error "upgrade install manifest does not track bin/cr: $coderail_archive_manifest_file" ||
        return 1
}

coderail_archive_checksum_line() {
    coderail_archive_root=$1
    coderail_archive_rel_path=$2

    coderail_archive_validate_manifest_path "$coderail_archive_rel_path" || return 1
    (
        cd "$coderail_archive_root" && cksum "$coderail_archive_rel_path"
    )
}

coderail_archive_validate_target_file() {
    coderail_archive_install_root=$1
    coderail_archive_old_manifest=$2
    coderail_archive_rel_path=$3
    coderail_archive_policy=$4
    coderail_archive_target_file=$coderail_archive_install_root/$coderail_archive_rel_path

    coderail_archive_validate_manifest_path "$coderail_archive_rel_path" || return 1

    [ -e "$coderail_archive_target_file" ] || return 0
    [ -f "$coderail_archive_target_file" ] ||
        coderail_archive_error "target path is not a regular file: $coderail_archive_target_file" ||
        return 1

    if [ -f "$coderail_archive_old_manifest" ] &&
        coderail_archive_manifest_path_exists "$coderail_archive_old_manifest" "$coderail_archive_rel_path"
    then
        coderail_archive_old_line=$(
            coderail_archive_manifest_line_for_path "$coderail_archive_old_manifest" "$coderail_archive_rel_path"
        ) || return 1
        coderail_archive_current_line=$(
            coderail_archive_checksum_line "$coderail_archive_install_root" "$coderail_archive_rel_path"
        ) || return 1

        if [ "$coderail_archive_current_line" != "$coderail_archive_old_line" ] &&
            [ "$coderail_archive_policy" = safe ]
        then
            coderail_archive_error "refusing to overwrite modified managed file: $coderail_archive_target_file"
            return 1
        fi
        return 0
    fi

    [ "$coderail_archive_policy" = force ] ||
        coderail_archive_error "refusing to overwrite untracked file: $coderail_archive_target_file" ||
        return 1
}

coderail_archive_stale_manifest_paths() {
    coderail_archive_old_manifest=$1
    coderail_archive_new_manifest=$2

    coderail_archive_validate_manifest_file "$coderail_archive_old_manifest" || return 1
    coderail_archive_validate_manifest_file "$coderail_archive_new_manifest" || return 1

    while IFS= read -r coderail_archive_manifest_line ||
        [ -n "$coderail_archive_manifest_line" ]
    do
        [ -n "$coderail_archive_manifest_line" ] || continue
        coderail_archive_rel_path=$(
            coderail_archive_manifest_path_from_line "$coderail_archive_manifest_line"
        ) || return 1

        coderail_archive_manifest_path_exists "$coderail_archive_new_manifest" "$coderail_archive_rel_path" &&
            continue
        printf '%s\n' "$coderail_archive_rel_path"
    done < "$coderail_archive_old_manifest"
}

coderail_archive_validate_stale_file() {
    coderail_archive_install_root=$1
    coderail_archive_old_manifest=$2
    coderail_archive_rel_path=$3
    coderail_archive_policy=$4
    coderail_archive_target_file=$coderail_archive_install_root/$coderail_archive_rel_path

    coderail_archive_validate_manifest_path "$coderail_archive_rel_path" || return 1

    [ -e "$coderail_archive_target_file" ] || return 0
    [ -f "$coderail_archive_target_file" ] ||
        coderail_archive_error "managed path is not a regular file: $coderail_archive_target_file" ||
        return 1

    coderail_archive_old_line=$(
        coderail_archive_manifest_line_for_path "$coderail_archive_old_manifest" "$coderail_archive_rel_path"
    ) || return 1
    coderail_archive_current_line=$(
        coderail_archive_checksum_line "$coderail_archive_install_root" "$coderail_archive_rel_path"
    ) || return 1

    if [ "$coderail_archive_current_line" != "$coderail_archive_old_line" ] &&
        [ "$coderail_archive_policy" = safe ]
    then
        coderail_archive_error "refusing to remove modified managed file: $coderail_archive_target_file"
        return 1
    fi
}

coderail_archive_validate_apply() {
    coderail_archive_install_root=$1
    coderail_archive_stage_dir=$2
    coderail_archive_new_manifest=$3
    coderail_archive_policy=$4
    coderail_archive_old_manifest=$coderail_archive_install_root/.coderail-install
    coderail_archive_list_file=$(mktemp "${TMPDIR:-/tmp}/coderail-archive-files.XXXXXX") || return 1
    coderail_archive_status=0

    log_info "Validating install"
    log_notice "install root: $coderail_archive_install_root"

    coderail_archive_validate_policy "$coderail_archive_policy" || return 1
    coderail_archive_validate_manifest_file "$coderail_archive_new_manifest" || return 1

    [ ! -e "$coderail_archive_install_root" ] || [ -d "$coderail_archive_install_root" ] ||
        coderail_archive_error "install root exists and is not a directory: $coderail_archive_install_root" ||
        return 1

    if [ -f "$coderail_archive_old_manifest" ]; then
        coderail_archive_validate_manifest_file "$coderail_archive_old_manifest" || return 1
    fi

    find "$coderail_archive_stage_dir" -type f | sort > "$coderail_archive_list_file" ||
        coderail_archive_status=1

    while [ "$coderail_archive_status" -eq 0 ] &&
        IFS= read -r coderail_archive_stage_file
    do
        coderail_archive_rel_path=$(
            coderail_archive_relative_path "$coderail_archive_stage_file" "$coderail_archive_stage_dir"
        ) || {
            coderail_archive_status=1
            break
        }

        coderail_archive_validate_target_file \
            "$coderail_archive_install_root" \
            "$coderail_archive_old_manifest" \
            "$coderail_archive_rel_path" \
            "$coderail_archive_policy" ||
            coderail_archive_status=1
    done < "$coderail_archive_list_file"

    rm -f "$coderail_archive_list_file"
    [ "$coderail_archive_status" -eq 0 ] || return 1

    [ -f "$coderail_archive_old_manifest" ] || return 0

    coderail_archive_stale_manifest_paths "$coderail_archive_old_manifest" "$coderail_archive_new_manifest" |
        while IFS= read -r coderail_archive_rel_path; do
            [ -n "$coderail_archive_rel_path" ] || continue
            coderail_archive_validate_stale_file \
                "$coderail_archive_install_root" \
                "$coderail_archive_old_manifest" \
                "$coderail_archive_rel_path" \
                "$coderail_archive_policy" || exit 1
        done
}

coderail_archive_copy_staged_files() {
    coderail_archive_install_root=$1
    coderail_archive_stage_dir=$2
    coderail_archive_list_file=$(mktemp "${TMPDIR:-/tmp}/coderail-archive-files.XXXXXX") || return 1
    coderail_archive_status=0

    log_info "Installing managed files"

    find "$coderail_archive_stage_dir" -type f | sort > "$coderail_archive_list_file" ||
        coderail_archive_status=1

    while [ "$coderail_archive_status" -eq 0 ] &&
        IFS= read -r coderail_archive_stage_file
    do
        coderail_archive_rel_path=$(
            coderail_archive_relative_path "$coderail_archive_stage_file" "$coderail_archive_stage_dir"
        ) || {
            coderail_archive_status=1
            break
        }

        coderail_archive_target_file=$coderail_archive_install_root/$coderail_archive_rel_path
        log_notice "installing $coderail_archive_rel_path"
        mkdir -p "$(dirname "$coderail_archive_target_file")" || {
            coderail_archive_status=1
            break
        }
        cp "$coderail_archive_stage_file" "$coderail_archive_target_file" || {
            coderail_archive_status=1
            break
        }

        if [ "$coderail_archive_rel_path" = bin/cr ]; then
            chmod 755 "$coderail_archive_target_file" || coderail_archive_status=1
        fi
    done < "$coderail_archive_list_file"

    rm -f "$coderail_archive_list_file"
    return "$coderail_archive_status"
}

coderail_archive_remove_empty_parent_dirs() {
    coderail_archive_install_root=$1
    coderail_archive_rel_path=$2
    coderail_archive_rel_dir=$(dirname "$coderail_archive_rel_path")

    while [ "$coderail_archive_rel_dir" != "." ]; do
        rmdir "$coderail_archive_install_root/$coderail_archive_rel_dir" 2>/dev/null || return 0

        case "$coderail_archive_rel_dir" in
            */*) coderail_archive_rel_dir=${coderail_archive_rel_dir%/*} ;;
            *) coderail_archive_rel_dir=. ;;
        esac
    done
}

coderail_archive_remove_stale_files() {
    coderail_archive_install_root=$1
    coderail_archive_old_manifest=$2
    coderail_archive_new_manifest=$3

    [ -f "$coderail_archive_old_manifest" ] || return 0

    coderail_archive_stale_manifest_paths "$coderail_archive_old_manifest" "$coderail_archive_new_manifest" |
        while IFS= read -r coderail_archive_rel_path; do
            [ -n "$coderail_archive_rel_path" ] || continue
            coderail_archive_validate_manifest_path "$coderail_archive_rel_path" || exit 1
            coderail_archive_target_file=$coderail_archive_install_root/$coderail_archive_rel_path

            if [ -e "$coderail_archive_target_file" ]; then
                log_notice "removing stale managed file: $coderail_archive_rel_path"
                rm -f "$coderail_archive_target_file" || exit 1
            fi

            coderail_archive_remove_empty_parent_dirs \
                "$coderail_archive_install_root" \
                "$coderail_archive_rel_path"
        done
}

coderail_archive_write_manifest() {
    coderail_archive_install_root=$1
    coderail_archive_new_manifest=$2
    coderail_archive_manifest_tmp=$coderail_archive_install_root/.coderail-install.tmp.$$

    log_info "Writing install manifest"
    log_notice "manifest target: $coderail_archive_install_root/.coderail-install"

    coderail_archive_validate_manifest_file "$coderail_archive_new_manifest" || return 1
    cp "$coderail_archive_new_manifest" "$coderail_archive_manifest_tmp" || return 1
    mv "$coderail_archive_manifest_tmp" "$coderail_archive_install_root/.coderail-install"
}

coderail_archive_apply_staged() {
    coderail_archive_stage_dir=$1
    coderail_archive_new_manifest=$2
    coderail_archive_install_root=$3
    coderail_archive_policy=$4
    coderail_archive_old_manifest=$coderail_archive_install_root/.coderail-install

    coderail_archive_validate_apply \
        "$coderail_archive_install_root" \
        "$coderail_archive_stage_dir" \
        "$coderail_archive_new_manifest" \
        "$coderail_archive_policy" ||
        return 1

    mkdir -p "$coderail_archive_install_root" || return 1
    coderail_archive_remove_stale_files \
        "$coderail_archive_install_root" \
        "$coderail_archive_old_manifest" \
        "$coderail_archive_new_manifest" ||
        return 1
    coderail_archive_copy_staged_files "$coderail_archive_install_root" "$coderail_archive_stage_dir" ||
        return 1
    coderail_archive_write_manifest "$coderail_archive_install_root" "$coderail_archive_new_manifest"
}

coderail_archive_apply_source_policy() {
    coderail_archive_source_root=$1
    coderail_archive_install_root=$2
    coderail_archive_policy=$3
    coderail_archive_work_dir=$(mktemp -d "${TMPDIR:-/tmp}/coderail-archive-apply.XXXXXX") || return 1
    coderail_archive_stage_dir=$coderail_archive_work_dir/stage
    coderail_archive_new_manifest=$coderail_archive_work_dir/manifest
    coderail_archive_status=0

    mkdir "$coderail_archive_stage_dir" || coderail_archive_status=1

    if [ "$coderail_archive_status" -eq 0 ]; then
        coderail_archive_stage_source "$coderail_archive_source_root" "$coderail_archive_stage_dir" ||
            coderail_archive_status=1
    fi

    if [ "$coderail_archive_status" -eq 0 ]; then
        coderail_archive_build_manifest "$coderail_archive_stage_dir" "$coderail_archive_new_manifest" ||
            coderail_archive_status=1
    fi

    if [ "$coderail_archive_status" -eq 0 ]; then
        coderail_archive_apply_staged \
            "$coderail_archive_stage_dir" \
            "$coderail_archive_new_manifest" \
            "$coderail_archive_install_root" \
            "$coderail_archive_policy" ||
            coderail_archive_status=1
    fi

    rm -rf "$coderail_archive_work_dir"
    return "$coderail_archive_status"
}

coderail_archive_apply_source() {
    coderail_archive_policy=$(coderail_archive_policy_from_force "$3") || return 1
    coderail_archive_apply_source_policy "$1" "$2" "$coderail_archive_policy"
}

coderail_archive_apply_target_cleanup() {
    if [ -n "${coderail_archive_target_work_dir:-}" ]; then
        rm -rf "$coderail_archive_target_work_dir"
    fi
}

coderail_archive_apply_target_policy() {
    (
        set -eu

        coderail_archive_target=$1
        coderail_archive_install_root=$2
        coderail_archive_policy=$3
        coderail_archive_validate_policy "$coderail_archive_policy"
        coderail_archive_target_work_dir=$(mktemp -d "${TMPDIR:-/tmp}/coderail-archive-target.XXXXXX")
        coderail_archive_archive_file=$coderail_archive_target_work_dir/archive.tar.gz
        coderail_archive_extract_dir=$coderail_archive_target_work_dir/extract

        trap coderail_archive_apply_target_cleanup EXIT
        trap 'coderail_archive_apply_target_cleanup; exit 1' HUP INT TERM

        log_notice "archive target: $coderail_archive_target"
        log_notice "install root: $coderail_archive_install_root"

        mkdir "$coderail_archive_extract_dir"
        coderail_archive_download "$coderail_archive_target" "$coderail_archive_archive_file"
        log_info "Extracting archive"
        log_notice "extract directory: $coderail_archive_extract_dir"
        coderail_archive_source_root=$(
            coderail_archive_extract_source_root \
                "$coderail_archive_archive_file" \
                "$coderail_archive_extract_dir"
        )
        log_notice "extracted source root: $coderail_archive_source_root"
        coderail_archive_apply_source_policy \
            "$coderail_archive_source_root" \
            "$coderail_archive_install_root" \
            "$coderail_archive_policy"
    )
}

coderail_archive_apply_target() {
    coderail_archive_policy=$(coderail_archive_policy_from_force "$3") || return 1
    coderail_archive_apply_target_policy "$1" "$2" "$coderail_archive_policy"
}

coderail_archive_upgrade_target() {
    coderail_archive_validate_upgrade_install "$2" || return 1
    coderail_archive_apply_target_policy "$1" "$2" upgrade
}

coderail_archive_main() {
    [ "$#" -gt 0 ] || {
        coderail_archive_usage_error "missing mode"
        return 2
    }

    coderail_archive_mode=$1
    shift

    case "$coderail_archive_mode" in
        resolve-target)
            [ "$#" -eq 1 ] || {
                coderail_archive_usage_error "resolve-target requires <target>"
                return 2
            }
            coderail_archive_ref=$(coderail_archive_target_ref "$1") || return 1
            coderail_archive_url=$(coderail_archive_target_url "$1") || return 1
            printf '%s\n%s\n' "$coderail_archive_ref" "$coderail_archive_url"
            ;;
        download-archive)
            [ "$#" -eq 2 ] || {
                coderail_archive_usage_error "download-archive requires <target> <archive-file>"
                return 2
            }
            coderail_archive_download "$1" "$2"
            ;;
        extract-source)
            [ "$#" -eq 2 ] || {
                coderail_archive_usage_error "extract-source requires <archive-file> <extract-dir>"
                return 2
            }
            coderail_archive_extract_source_root "$1" "$2"
            ;;
        stage-source)
            [ "$#" -eq 3 ] || {
                coderail_archive_usage_error "stage-source requires <source-root> <stage-dir> <manifest-file>"
                return 2
            }
            coderail_archive_stage_source "$1" "$2" || return 1
            coderail_archive_build_manifest "$2" "$3"
            ;;
        validate-upgrade-install)
            [ "$#" -eq 1 ] || {
                coderail_archive_usage_error "validate-upgrade-install requires <install-root>"
                return 2
            }
            coderail_archive_validate_upgrade_install "$1"
            ;;
        apply-source)
            [ "$#" -eq 3 ] || {
                coderail_archive_usage_error "apply-source requires <source-root> <install-root> <force>"
                return 2
            }
            coderail_archive_apply_source "$1" "$2" "$3"
            ;;
        apply-target)
            [ "$#" -eq 3 ] || {
                coderail_archive_usage_error "apply-target requires <target> <install-root> <force>"
                return 2
            }
            coderail_archive_apply_target "$1" "$2" "$3"
            ;;
        upgrade-target)
            [ "$#" -eq 2 ] || {
                coderail_archive_usage_error "upgrade-target requires <target> <install-root>"
                return 2
            }
            coderail_archive_upgrade_target "$1" "$2"
            ;;
        -h|--help)
            [ "$#" -eq 0 ] || {
                coderail_archive_usage_error "unexpected argument: $1"
                return 2
            }
            coderail_archive_usage
            ;;
        *)
            coderail_archive_usage_error "unknown mode: $coderail_archive_mode"
            return 2
            ;;
    esac
}

if [ "${CODERAIL_ARCHIVE_APPLY_NO_MAIN:-0}" != 1 ]; then
    case "${0##*/}" in
        archive_apply.sh)
            coderail_archive_main "$@"
            exit $?
            ;;
    esac
fi

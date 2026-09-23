#!/usr/bin/env sh

# This module is deliberately private to the upgrade command.  Its records use
# tabs as separators, so payload names containing tabs or newlines are refused
# by path_manifest_relative before they can reach a plan or manifest.

_internal_install_tab=$(printf '\t')

_internal_install_error()
{
    log_error "$*"
    _internal_install_failed=1
}

_internal_install_real_directory()
{
    _internal_install_directory=$1
    [ -d "$_internal_install_directory" ] && [ ! -L "$_internal_install_directory" ] || return 1
    (
        CDPATH= cd -P "$_internal_install_directory" 2>/dev/null && pwd
    )
}

# Write an absolute lexical path with all existing components resolved.  The
# destination itself may be absent for a first installation, but a link or a
# non-directory in its existing ancestry is never accepted.
_internal_install_destination_root()
{
    _internal_install_raw_destination=$1
    case "$_internal_install_raw_destination" in
        '') return 1 ;;
        /*) _internal_install_absolute_destination=$_internal_install_raw_destination ;;
        *)
            _internal_install_cwd=$(pwd -P 2>/dev/null) || return 1
            _internal_install_absolute_destination=$_internal_install_cwd/$_internal_install_raw_destination
            ;;
    esac

    while [ "$_internal_install_absolute_destination" != / ] && \
        [ "${_internal_install_absolute_destination%/}" != "$_internal_install_absolute_destination" ]; do
        _internal_install_absolute_destination=${_internal_install_absolute_destination%/}
    done

    case "$_internal_install_absolute_destination" in
        *"$_internal_install_tab"*|*//*|*/./*|*/../*|*/.|*/..) return 1 ;;
    esac
    _internal_install_newline='
'
    case "$_internal_install_absolute_destination" in
        *"$_internal_install_newline"*) return 1 ;;
    esac

    _internal_install_probe=$_internal_install_absolute_destination
    _internal_install_missing=
    while [ ! -e "$_internal_install_probe" ] && [ ! -L "$_internal_install_probe" ]; do
        _internal_install_component=${_internal_install_probe##*/}
        if [ -n "$_internal_install_missing" ]; then
            _internal_install_missing=$_internal_install_component/$_internal_install_missing
        else
            _internal_install_missing=$_internal_install_component
        fi
        _internal_install_parent=$(dirname "$_internal_install_probe") || return 1
        [ "$_internal_install_parent" != "$_internal_install_probe" ] || return 1
        _internal_install_probe=$_internal_install_parent
    done

    _internal_install_parent=$(_internal_install_real_directory "$_internal_install_probe") || return 1
    if [ -n "$_internal_install_missing" ]; then
        printf '%s/%s\n' "$_internal_install_parent" "$_internal_install_missing"
    else
        printf '%s\n' "$_internal_install_parent"
    fi
}

_internal_install_path_status()
{
    _internal_install_path=$1
    if [ -L "$_internal_install_path" ]; then
        printf '%s\n' link
        return 0
    fi
    if [ -f "$_internal_install_path" ]; then
        _internal_install_checksum=$(path_checksum "$_internal_install_path") || {
            printf '%s\n' file-unreadable
            return 0
        }
        printf 'file:%s\n' "${_internal_install_checksum% *}:${_internal_install_checksum#* }"
        return 0
    fi
    if [ -d "$_internal_install_path" ]; then
        printf '%s\n' directory
        return 0
    fi
    if [ -e "$_internal_install_path" ]; then
        printf '%s\n' other
        return 0
    fi
    printf '%s\n' absent
}

_internal_install_status_matches()
{
    _internal_install_actual=$(_internal_install_path_status "$1") || return 1
    [ "$_internal_install_actual" = "$2" ]
}

_internal_install_safe_parent()
{
    _internal_install_parent=$(dirname "$1") || return 1
    while :; do
        if [ -L "$_internal_install_parent" ]; then
            return 1
        fi
        if [ -e "$_internal_install_parent" ]; then
            [ -d "$_internal_install_parent" ] || return 1
        fi
        [ "$_internal_install_parent" = "$_internal_install_destination" ] && return 0
        [ "$_internal_install_parent" != / ] || return 0
        _internal_install_parent=$(dirname "$_internal_install_parent") || return 1
    done
}

_internal_install_ensure_directory()
(
    # A subshell gives each recursive level its own POSIX-shell variables.
    # Without local variables, a recursive call would otherwise replace the
    # child pathname with its parent before the final mkdir.
    _internal_install_directory=$1
    [ "$_internal_install_directory" = / ] && exit 0
    [ ! -L "$_internal_install_directory" ] || exit 1
    if [ -e "$_internal_install_directory" ]; then
        [ -d "$_internal_install_directory" ]
        exit
    fi
    _internal_install_parent=$(dirname "$_internal_install_directory") || exit 1
    _internal_install_ensure_directory "$_internal_install_parent" || exit 1
    mkdir "$_internal_install_directory" 2>/dev/null || exit 1
    [ -d "$_internal_install_directory" ] && [ ! -L "$_internal_install_directory" ]
)

_internal_install_lookup()
{
    _internal_install_lookup_file=$1
    _internal_install_lookup_path=$2
    while IFS="$_internal_install_tab" read -r _internal_install_record_path _internal_install_record_kind \
        _internal_install_record_checksum _internal_install_record_length _internal_install_record_source; do
        [ "$_internal_install_record_path" = "$_internal_install_lookup_path" ] || continue
        printf '%s\t%s\t%s\t%s\n' "$_internal_install_record_kind" \
            "$_internal_install_record_checksum" "$_internal_install_record_length" \
            "$_internal_install_record_source"
        return 0
    done < "$_internal_install_lookup_file"
    return 1
}

_internal_install_validate_payload_tree()
{
    _internal_install_tree=$1
    find "$_internal_install_tree" -exec sh -c '
        for item do
            if [ -L "$item" ] || { [ ! -d "$item" ] && [ ! -f "$item" ]; }; then
                exit 1
            fi
        done
    ' sh {} + >/dev/null 2>&1
}

_internal_install_inventory_root()
{
    _internal_install_root_name=$1
    _internal_install_kind=$2
    _internal_install_root=$_internal_install_source/$_internal_install_root_name
    [ -d "$_internal_install_root" ] && [ ! -L "$_internal_install_root" ] || return 1
    _internal_install_validate_payload_tree "$_internal_install_root" || return 1

    find "$_internal_install_root" -type f -print | LC_ALL=C sort > "$_internal_install_work/files" || return 1
    while IFS= read -r _internal_install_source_file || [ -n "$_internal_install_source_file" ]; do
        [ -n "$_internal_install_source_file" ] || continue
        _internal_install_relative=${_internal_install_source_file#"$_internal_install_source/"}
        _internal_install_relative=$(path_manifest_relative "$_internal_install_relative") || return 1
        [ ! -L "$_internal_install_source_file" ] && [ -f "$_internal_install_source_file" ] || return 1
        _internal_install_checksum=$(path_checksum "$_internal_install_source_file") || return 1
        printf '%s\t%s\t%s\t%s\t%s\n' "$_internal_install_relative" "$_internal_install_kind" \
            "${_internal_install_checksum% *}" "${_internal_install_checksum#* }" \
            "$_internal_install_source_file" >> "$_internal_install_work/incoming.unsorted" || return 1
    done < "$_internal_install_work/files"
}

_internal_install_inventory()
{
    : > "$_internal_install_work/incoming.unsorted" || return 1
    _internal_install_inventory_root bin program || return 1
    _internal_install_inventory_root lib program || return 1

    for _internal_install_optional_root in instructions templates; do
        if [ -e "$_internal_install_source/$_internal_install_optional_root" ] || \
            [ -L "$_internal_install_source/$_internal_install_optional_root" ]; then
            _internal_install_inventory_root "$_internal_install_optional_root" protected || return 1
        fi
    done

    [ -f "$_internal_install_source/bin/cr" ] && [ ! -L "$_internal_install_source/bin/cr" ] && \
        [ -x "$_internal_install_source/bin/cr" ] || return 1
    LC_ALL=C sort -t "$_internal_install_tab" -k1,1 "$_internal_install_work/incoming.unsorted" \
        > "$_internal_install_work/incoming" || return 1
}

_internal_install_read_manifest()
{
    _internal_install_manifest_file=$1
    : > "$_internal_install_work/prior" || return 1
    [ -f "$_internal_install_manifest_file" ] && [ ! -L "$_internal_install_manifest_file" ] && \
        [ -r "$_internal_install_manifest_file" ] || return 1

    # A newline terminator is part of the schema.  The command substitution
    # intentionally strips it, so inspect the final byte independently.
    [ -s "$_internal_install_manifest_file" ] || return 1
    [ "$(tail -c 1 "$_internal_install_manifest_file" 2>/dev/null)" = "" ] || return 1

    IFS= read -r _internal_install_header < "$_internal_install_manifest_file" || return 1
    [ "$_internal_install_header" = "coderail-install-manifest$_internal_install_tab"'1' ] || return 1

    sed '1d' "$_internal_install_manifest_file" > "$_internal_install_work/manifest.records" || return 1
    awk -v "FS=$_internal_install_tab" 'NF != 5 { exit 1 }' \
        "$_internal_install_work/manifest.records" || return 1
    while IFS= read -r _internal_install_manifest_line || [ -n "$_internal_install_manifest_line" ]; do
        [ -n "$_internal_install_manifest_line" ] || return 1
        IFS="$_internal_install_tab" read -r _internal_install_label _internal_install_kind \
            _internal_install_relative _internal_install_checksum _internal_install_length _internal_install_extra <<EOF
$_internal_install_manifest_line
EOF
        [ "$_internal_install_label" = file ] && [ -z "${_internal_install_extra:-}" ] || return 1
        _internal_install_checked_relative=$(path_manifest_relative "$_internal_install_relative") || return 1
        [ "$_internal_install_checked_relative" = "$_internal_install_relative" ] || return 1
        case "$_internal_install_checksum" in ''|*[!0-9]*) return 1 ;; esac
        case "$_internal_install_length" in ''|*[!0-9]*) return 1 ;; esac
        case "$_internal_install_kind:$_internal_install_relative" in
            program:bin/*|program:lib/*|protected:instructions/*|protected:templates/*) ;;
            *) return 1 ;;
        esac
        printf '%s\t%s\t%s\t%s\n' "$_internal_install_relative" "$_internal_install_kind" \
            "$_internal_install_checksum" "$_internal_install_length" >> "$_internal_install_work/prior" || return 1
    done < "$_internal_install_work/manifest.records"

    LC_ALL=C sort -c -t "$_internal_install_tab" -k1,1 -u "$_internal_install_work/prior" 2>/dev/null || return 1
}

_internal_install_collect_collision()
{
    _internal_install_error "Unmanaged collision: $1 (move it before retrying)"
}

_internal_install_confirm()
{
    _internal_install_question=$1
    if [ "$_internal_install_yes" -eq 1 ]; then
        return 0
    fi
    if log_confirm "$_internal_install_question"; then
        return 0
    else
        _internal_install_confirm_status=$?
    fi
    [ "$_internal_install_confirm_status" -eq 1 ] && return 1
    _internal_install_error "Cannot continue without confirmation; rerun interactively or with --force --yes"
    return 2
}

_internal_install_v1_marker_exists()
{
    case "${CODERAIL_INTERNAL_ORIGIN:-}" in
        install|upgrade) ;;
        *) return 1 ;;
    esac
    [ -d "$_internal_install_destination" ] && [ ! -L "$_internal_install_destination" ] || return 1
    [ -f "$_internal_install_destination/.coderail-install" ] && \
        [ ! -L "$_internal_install_destination/.coderail-install" ]
}

_internal_install_v1_backup_path()
{
    _internal_install_backup_parent=$(dirname "$_internal_install_destination") || return 1
    _internal_install_backup_base=${_internal_install_destination##*/}
    [ -n "$_internal_install_backup_base" ] || return 1

    # POSIX mktemp templates require trailing Xs. Link its unique temporary
    # file to the requested .tar.gz name before releasing the temporary name.
    _internal_install_backup_temp=$(mktemp "$_internal_install_backup_parent/${_internal_install_backup_base}-v1-backup.XXXXXX" 2>/dev/null) || return 1
    _internal_install_backup=$_internal_install_backup_temp.tar.gz
    if ! ln "$_internal_install_backup_temp" "$_internal_install_backup" 2>/dev/null; then
        rm -f "$_internal_install_backup_temp"
        return 1
    fi
    rm -f "$_internal_install_backup_temp"
    printf '%s\n' "$_internal_install_backup"
}

_internal_install_confirm_v1_migration()
{
    if [ "$_internal_install_yes" -eq 1 ]; then
        return 0
    fi
    if log_confirm "$1"; then
        return 0
    else
        _internal_install_v1_confirmation_status=$?
    fi
    [ "$_internal_install_v1_confirmation_status" -eq 1 ] && return 1
    _internal_install_error "Cannot continue without confirmation; rerun interactively or with --yes"
    return 2
}

_internal_install_replace_v1()
{
    _internal_install_v1_backup=$(_internal_install_v1_backup_path) || {
        log_error "Failed to prepare v1 backup"
        return 1
    }
    if _internal_install_confirm_v1_migration \
        "Replace v1 installation at $_internal_install_destination with v2? Backup: $_internal_install_v1_backup"; then
        :
    else
        _internal_install_v1_confirmation_status=$?
        rm -f "$_internal_install_v1_backup"
        return "$_internal_install_v1_confirmation_status"
    fi
    if ! tar -czf "$_internal_install_v1_backup" -C "$(dirname "$_internal_install_destination")" \
        "${_internal_install_destination##*/}"; then
        rm -f "$_internal_install_v1_backup"
        log_error "Failed to create v1 backup"
        return 1
    fi
    output "v1 backup: $_internal_install_v1_backup"
    if ! rm -rf "$_internal_install_destination"; then
        _internal_install_error "Failed to replace v1 installation; backup retained at $_internal_install_v1_backup"
        return 1
    fi
    if ! mkdir "$_internal_install_destination" 2>/dev/null; then
        _internal_install_error "Failed to recreate v1 installation directory; backup retained at $_internal_install_v1_backup"
        return 1
    fi
}

_internal_install_report_v1_backup()
{
    [ -n "$_internal_install_v1_backup" ] || return 0
    log_error "v1 backup retained at $_internal_install_v1_backup"
}

_internal_install_add_plan()
{
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$@" >> "$_internal_install_work/plan" || return 1
}

_internal_install_plan_incoming()
{
    _internal_install_relative=$1
    _internal_install_incoming=$(_internal_install_lookup "$_internal_install_work/incoming" "$_internal_install_relative") || return 1
    IFS="$_internal_install_tab" read -r _internal_install_kind _internal_install_checksum \
        _internal_install_length _internal_install_source_file <<EOF
$_internal_install_incoming
EOF
    _internal_install_target=$(path_manifest_target "$_internal_install_destination" "$_internal_install_relative") || return 1
    _internal_install_status=$(_internal_install_path_status "$_internal_install_target") || return 1

    if _internal_install_prior=$(_internal_install_lookup "$_internal_install_work/prior" "$_internal_install_relative"); then
        IFS="$_internal_install_tab" read -r _internal_install_prior_kind _internal_install_prior_checksum \
            _internal_install_prior_length _internal_install_unused <<EOF
$_internal_install_prior
EOF
        if [ "$_internal_install_status" = absent ]; then
            _internal_install_add_plan create "$_internal_install_relative" "$_internal_install_kind" \
                "$_internal_install_source_file" "$_internal_install_checksum" "$_internal_install_length" absent
            return
        fi
        if [ "$_internal_install_kind" = program ]; then
            if [ "$_internal_install_status" = "file:$_internal_install_checksum:$_internal_install_length" ]; then
                _internal_install_add_plan unchanged "$_internal_install_relative" "$_internal_install_kind" \
                    "$_internal_install_source_file" "$_internal_install_checksum" "$_internal_install_length" any
            else
                _internal_install_add_plan update "$_internal_install_relative" "$_internal_install_kind" \
                    "$_internal_install_source_file" "$_internal_install_checksum" "$_internal_install_length" any
            fi
            return
        fi

        if [ "$_internal_install_status" = "file:$_internal_install_prior_checksum:$_internal_install_prior_length" ]; then
            if [ "$_internal_install_status" = "file:$_internal_install_checksum:$_internal_install_length" ]; then
                _internal_install_add_plan unchanged "$_internal_install_relative" "$_internal_install_kind" \
                    "$_internal_install_source_file" "$_internal_install_checksum" "$_internal_install_length" \
                    "$_internal_install_status"
            else
                _internal_install_add_plan update "$_internal_install_relative" "$_internal_install_kind" \
                    "$_internal_install_source_file" "$_internal_install_checksum" "$_internal_install_length" \
                    "$_internal_install_status"
            fi
            return
        fi

        if [ "$_internal_install_force" -eq 1 ]; then
            if _internal_install_confirm "Replace edited protected file $_internal_install_relative?"; then
                _internal_install_add_plan update "$_internal_install_relative" "$_internal_install_kind" \
                    "$_internal_install_source_file" "$_internal_install_checksum" "$_internal_install_length" \
                    "$_internal_install_status"
            else
                _internal_install_confirmation_status=$?
                [ "$_internal_install_confirmation_status" -eq 1 ] || return 1
                _internal_install_add_plan preserve "$_internal_install_relative" "$_internal_install_kind" \
                    "$_internal_install_source_file" "$_internal_install_checksum" "$_internal_install_length" \
                    "$_internal_install_status"
            fi
        else
            _internal_install_add_plan preserve "$_internal_install_relative" "$_internal_install_kind" \
                "$_internal_install_source_file" "$_internal_install_checksum" "$_internal_install_length" \
                "$_internal_install_status"
        fi
    else
        if [ "$_internal_install_status" = absent ]; then
            _internal_install_add_plan create "$_internal_install_relative" "$_internal_install_kind" \
                "$_internal_install_source_file" "$_internal_install_checksum" "$_internal_install_length" absent
        else
            _internal_install_collect_collision "$_internal_install_relative"
        fi
    fi
}

_internal_install_plan_obsolete()
{
    _internal_install_relative=$1
    _internal_install_prior=$(_internal_install_lookup "$_internal_install_work/prior" "$_internal_install_relative") || return 1
    IFS="$_internal_install_tab" read -r _internal_install_kind _internal_install_checksum \
        _internal_install_length _internal_install_unused <<EOF
$_internal_install_prior
EOF
    _internal_install_target=$(path_manifest_target "$_internal_install_destination" "$_internal_install_relative") || return 1
    _internal_install_status=$(_internal_install_path_status "$_internal_install_target") || return 1
    if [ "$_internal_install_status" = absent ]; then
        _internal_install_add_plan absent "$_internal_install_relative" "$_internal_install_kind" - \
            "$_internal_install_checksum" "$_internal_install_length" absent
        return
    fi
    if [ "$_internal_install_kind" = program ] || \
        [ "$_internal_install_status" = "file:$_internal_install_checksum:$_internal_install_length" ]; then
        _internal_install_add_plan remove "$_internal_install_relative" "$_internal_install_kind" - \
            "$_internal_install_checksum" "$_internal_install_length" "$_internal_install_status"
        return
    fi
    if [ "$_internal_install_force" -eq 1 ]; then
        if _internal_install_confirm "Delete edited protected file $_internal_install_relative?"; then
            _internal_install_add_plan remove "$_internal_install_relative" "$_internal_install_kind" - \
                "$_internal_install_checksum" "$_internal_install_length" "$_internal_install_status"
        else
            _internal_install_confirmation_status=$?
            [ "$_internal_install_confirmation_status" -eq 1 ] || return 1
            _internal_install_add_plan release "$_internal_install_relative" "$_internal_install_kind" - \
                "$_internal_install_checksum" "$_internal_install_length" "$_internal_install_status"
        fi
    else
        _internal_install_add_plan release "$_internal_install_relative" "$_internal_install_kind" - \
            "$_internal_install_checksum" "$_internal_install_length" "$_internal_install_status"
    fi
}

_internal_install_build_plan()
{
    : > "$_internal_install_work/plan" || return 1
    {
        cut -f 1 "$_internal_install_work/incoming"
        cut -f 1 "$_internal_install_work/prior"
    } | LC_ALL=C sort -u > "$_internal_install_work/paths" || return 1

    while IFS= read -r _internal_install_relative || [ -n "$_internal_install_relative" ]; do
        [ -n "$_internal_install_relative" ] || continue
        if _internal_install_lookup "$_internal_install_work/incoming" "$_internal_install_relative" >/dev/null; then
            _internal_install_plan_incoming "$_internal_install_relative" || return 1
        else
            _internal_install_plan_obsolete "$_internal_install_relative" || return 1
        fi
    done < "$_internal_install_work/paths"
}

_internal_install_validate_plan_parents()
{
    while IFS="$_internal_install_tab" read -r _internal_install_action _internal_install_relative \
        _internal_install_kind _internal_install_source_file _internal_install_checksum _internal_install_length \
        _internal_install_expected; do
        case "$_internal_install_action" in
            create|update|remove|release)
                _internal_install_target=$(path_manifest_target "$_internal_install_destination" "$_internal_install_relative") || return 1
                if ! _internal_install_safe_parent "$_internal_install_target"; then
                    _internal_install_error "Unsafe destination parent for $_internal_install_relative"
                fi
                ;;
        esac
    done < "$_internal_install_work/plan"
    if ! _internal_install_safe_parent "$_internal_install_manifest"; then
        _internal_install_error "Unsafe destination parent for .coderail/install.manifest"
    fi
    [ "$_internal_install_failed" -eq 0 ]
}

_internal_install_state_set()
{
    _internal_install_state_path=$1
    _internal_install_state_kind=$2
    _internal_install_state_checksum=$3
    _internal_install_state_length=$4
    : > "$_internal_install_work/state.next" || return 1
    while IFS="$_internal_install_tab" read -r _internal_install_record_path _internal_install_record_kind \
        _internal_install_record_checksum _internal_install_record_length; do
        [ "$_internal_install_record_path" = "$_internal_install_state_path" ] && continue
        printf '%s\t%s\t%s\t%s\n' "$_internal_install_record_path" "$_internal_install_record_kind" \
            "$_internal_install_record_checksum" "$_internal_install_record_length" >> "$_internal_install_work/state.next" || return 1
    done < "$_internal_install_work/state"
    printf '%s\t%s\t%s\t%s\n' "$_internal_install_state_path" "$_internal_install_state_kind" \
        "$_internal_install_state_checksum" "$_internal_install_state_length" >> "$_internal_install_work/state.next" || return 1
    LC_ALL=C sort -t "$_internal_install_tab" -k1,1 "$_internal_install_work/state.next" > "$_internal_install_work/state.sorted" || return 1
    mv -f "$_internal_install_work/state.sorted" "$_internal_install_work/state" || return 1
}

_internal_install_state_remove()
{
    _internal_install_state_path=$1
    : > "$_internal_install_work/state.next" || return 1
    while IFS="$_internal_install_tab" read -r _internal_install_record_path _internal_install_record_kind \
        _internal_install_record_checksum _internal_install_record_length; do
        [ "$_internal_install_record_path" = "$_internal_install_state_path" ] && continue
        printf '%s\t%s\t%s\t%s\n' "$_internal_install_record_path" "$_internal_install_record_kind" \
            "$_internal_install_record_checksum" "$_internal_install_record_length" >> "$_internal_install_work/state.next" || return 1
    done < "$_internal_install_work/state"
    mv -f "$_internal_install_work/state.next" "$_internal_install_work/state" || return 1
}

_internal_install_manifest_matches_expected()
{
    if [ "$_internal_install_manifest_expected" = absent ]; then
        [ "$(_internal_install_path_status "$_internal_install_manifest")" = absent ]
    else
        _internal_install_status_matches "$_internal_install_manifest" "$_internal_install_manifest_expected"
    fi
}

_internal_install_publish_manifest()
{
    _internal_install_manifest_matches_expected || return 1
    _internal_install_ensure_directory "$(dirname "$_internal_install_manifest")" || return 1
    _internal_install_manifest_matches_expected || return 1
    _internal_install_manifest_temp=$(mktemp "$(dirname "$_internal_install_manifest")/.install.manifest.XXXXXX" 2>/dev/null) || return 1
    {
        printf 'coderail-install-manifest\t1\n'
        while IFS="$_internal_install_tab" read -r _internal_install_record_path _internal_install_record_kind \
            _internal_install_record_checksum _internal_install_record_length; do
            printf 'file\t%s\t%s\t%s\t%s\n' "$_internal_install_record_kind" \
                "$_internal_install_record_path" "$_internal_install_record_checksum" \
                "$_internal_install_record_length"
        done < "$_internal_install_work/state"
    } > "$_internal_install_manifest_temp" || {
        rm -f "$_internal_install_manifest_temp"
        return 1
    }
    _internal_install_new_manifest_status=$(_internal_install_path_status "$_internal_install_manifest_temp") || {
        rm -f "$_internal_install_manifest_temp"
        return 1
    }
    _internal_install_manifest_matches_expected || {
        rm -f "$_internal_install_manifest_temp"
        return 1
    }
    mv -f "$_internal_install_manifest_temp" "$_internal_install_manifest" 2>/dev/null || {
        rm -f "$_internal_install_manifest_temp"
        return 1
    }
    _internal_install_manifest_expected=$_internal_install_new_manifest_status
}

_internal_install_copy()
{
    _internal_install_copy_source=$1
    _internal_install_copy_target=$2
    _internal_install_copy_expected=$3
    _internal_install_copy_checksum=$4
    _internal_install_copy_length=$5
    [ "$(path_checksum "$_internal_install_copy_source" 2>/dev/null || :)" = \
        "$_internal_install_copy_checksum $_internal_install_copy_length" ] || return 1
    if [ "$_internal_install_copy_expected" != any ] && \
        ! _internal_install_status_matches "$_internal_install_copy_target" "$_internal_install_copy_expected"; then
        return 1
    fi
    _internal_install_safe_parent "$_internal_install_copy_target" || return 1
    _internal_install_ensure_directory "$(dirname "$_internal_install_copy_target")" || return 1
    if [ "$_internal_install_copy_expected" != any ] && \
        ! _internal_install_status_matches "$_internal_install_copy_target" "$_internal_install_copy_expected"; then
        return 1
    fi
    _internal_install_copy_temp=$(mktemp "$(dirname "$_internal_install_copy_target")/.coderail-install.XXXXXX" 2>/dev/null) || return 1
    if ! cp -p "$_internal_install_copy_source" "$_internal_install_copy_temp" 2>/dev/null; then
        rm -f "$_internal_install_copy_temp"
        return 1
    fi
    if [ -d "$_internal_install_copy_target" ] && [ ! -L "$_internal_install_copy_target" ]; then
        if ! rmdir "$_internal_install_copy_target" 2>/dev/null; then
            rm -f "$_internal_install_copy_temp"
            return 1
        fi
    fi
    if ! mv -f "$_internal_install_copy_temp" "$_internal_install_copy_target" 2>/dev/null; then
        rm -f "$_internal_install_copy_temp"
        return 1
    fi
}

_internal_install_remove()
{
    _internal_install_remove_target=$1
    _internal_install_remove_expected=$2
    if [ "$_internal_install_remove_expected" != any ] && \
        ! _internal_install_status_matches "$_internal_install_remove_target" "$_internal_install_remove_expected"; then
        return 1
    fi
    _internal_install_safe_parent "$_internal_install_remove_target" || return 1
    if [ -L "$_internal_install_remove_target" ] || [ -f "$_internal_install_remove_target" ]; then
        rm -f "$_internal_install_remove_target" 2>/dev/null
        return
    fi
    if [ -d "$_internal_install_remove_target" ]; then
        rmdir "$_internal_install_remove_target" 2>/dev/null
        return
    fi
    [ ! -e "$_internal_install_remove_target" ]
}

_internal_install_report_unattempted()
{
    _internal_install_after_path=$1
    _internal_install_after_seen=0
    while IFS="$_internal_install_tab" read -r _internal_install_after_action _internal_install_after_relative \
        _internal_install_after_rest; do
        if [ "$_internal_install_after_seen" -eq 1 ]; then
            output "not attempted: $_internal_install_after_relative"
        elif [ "$_internal_install_after_relative" = "$_internal_install_after_path" ]; then
            _internal_install_after_seen=1
        fi
    done < "$_internal_install_work/plan"
}

_internal_install_stop_action()
{
    _internal_install_error "$2"
    _internal_install_report_unattempted "$1"
    return 1
}

_internal_install_apply_plan()
{
    cp "$_internal_install_work/prior" "$_internal_install_work/state" || return 1
    while IFS="$_internal_install_tab" read -r _internal_install_action _internal_install_relative \
        _internal_install_kind _internal_install_source_file _internal_install_checksum _internal_install_length \
        _internal_install_expected; do
        _internal_install_target=$(path_manifest_target "$_internal_install_destination" "$_internal_install_relative") || return 1
        _internal_install_manifest_matches_expected || {
            _internal_install_stop_action "$_internal_install_relative" \
                "Failed: $_internal_install_relative (manifest changed after preflight)"
            return 1
        }
        case "$_internal_install_action" in
            create|update)
                if ! _internal_install_copy "$_internal_install_source_file" "$_internal_install_target" \
                    "$_internal_install_expected" "$_internal_install_checksum" "$_internal_install_length"; then
                    _internal_install_stop_action "$_internal_install_relative" "Failed: $_internal_install_relative"
                    return 1
                fi
                if ! _internal_install_state_set "$_internal_install_relative" "$_internal_install_kind" \
                    "$_internal_install_checksum" "$_internal_install_length"; then
                    _internal_install_stop_action "$_internal_install_relative" "Failed: $_internal_install_relative"
                    return 1
                fi
                if ! _internal_install_publish_manifest; then
                    _internal_install_stop_action "$_internal_install_relative" \
                        "Failed: $_internal_install_relative changed, but its manifest snapshot was not published"
                    return 1
                fi
                if [ "$_internal_install_action" = create ]; then
                    output "created: $_internal_install_relative"
                else
                    output "updated: $_internal_install_relative"
                fi
                ;;
            unchanged)
                if ! _internal_install_state_set "$_internal_install_relative" "$_internal_install_kind" \
                    "$_internal_install_checksum" "$_internal_install_length"; then
                    _internal_install_stop_action "$_internal_install_relative" "Failed: $_internal_install_relative"
                    return 1
                fi
                if ! _internal_install_publish_manifest; then
                    _internal_install_stop_action "$_internal_install_relative" \
                        "Failed: $_internal_install_relative manifest snapshot was not published"
                    return 1
                fi
                output "unchanged: $_internal_install_relative"
                ;;
            remove)
                if ! _internal_install_remove "$_internal_install_target" "$_internal_install_expected"; then
                    _internal_install_stop_action "$_internal_install_relative" "Failed: $_internal_install_relative"
                    return 1
                fi
                if ! _internal_install_state_remove "$_internal_install_relative" || ! _internal_install_publish_manifest; then
                    _internal_install_stop_action "$_internal_install_relative" \
                        "Failed: $_internal_install_relative removed, but its manifest snapshot was not published"
                    return 1
                fi
                output "removed: $_internal_install_relative"
                ;;
            absent)
                if ! _internal_install_state_remove "$_internal_install_relative" || ! _internal_install_publish_manifest; then
                    _internal_install_stop_action "$_internal_install_relative" \
                        "Failed: $_internal_install_relative manifest snapshot was not published"
                    return 1
                fi
                output "already absent: $_internal_install_relative"
                ;;
            preserve)
                output "preserved: $_internal_install_relative"
                ;;
            release)
                if ! _internal_install_safe_parent "$_internal_install_target" || \
                    ! _internal_install_status_matches "$_internal_install_target" "$_internal_install_expected"; then
                    _internal_install_stop_action "$_internal_install_relative" \
                        "Failed: $_internal_install_relative changed after preflight"
                    return 1
                fi
                if ! _internal_install_state_remove "$_internal_install_relative" || ! _internal_install_publish_manifest; then
                    _internal_install_stop_action "$_internal_install_relative" \
                        "Failed: $_internal_install_relative ownership release was not published"
                    return 1
                fi
                output "preserved: $_internal_install_relative"
                ;;
            *)
                _internal_install_stop_action "$_internal_install_relative" \
                    "Failed: $_internal_install_relative (invalid plan)"
                return 1
                ;;
        esac
    done < "$_internal_install_work/plan"
}

_internal_install()
{
    _internal_install_force=${1:-0}
    _internal_install_yes=${2:-0}
    _internal_install_failed=0
    [ "${CODERAIL_INTERNAL_INSTALL:-}" = 1 ] || {
        log_error "Internal installation is unavailable"
        return 1
    }
    [ -n "${CODERAIL_INTERNAL_SOURCE:-}" ] && [ -n "${CODERAIL_INTERNAL_DESTINATION:-}" ] || {
        log_error "Internal installation requires source and destination"
        return 1
    }
    _internal_install_source=$(_internal_install_real_directory "$CODERAIL_INTERNAL_SOURCE") || {
        log_error "Internal installation source must be a real directory"
        return 1
    }
    _internal_install_destination=$(_internal_install_destination_root "$CODERAIL_INTERNAL_DESTINATION") || {
        log_error "Internal installation destination is unsafe"
        return 1
    }
    if path_is_within "$_internal_install_source" "$_internal_install_destination" || \
        path_is_within "$_internal_install_destination" "$_internal_install_source"; then
        log_error "Internal installation source and destination must not overlap"
        return 1
    fi

    _internal_install_work=$(mktemp -d "${TMPDIR:-/tmp}/coderail-internal.XXXXXX" 2>/dev/null) || {
        log_error "Failed to prepare internal installation"
        return 1
    }
    if command -v register_temp_resource >/dev/null 2>&1; then
        register_temp_resource "$_internal_install_work"
    fi
    _internal_install_manifest=$_internal_install_destination/.coderail/install.manifest

    if ! _internal_install_inventory; then
        log_error "Internal installation payload is invalid"
        return 1
    fi
    _internal_install_v1_backup=
    if _internal_install_v1_marker_exists; then
        _internal_install_replace_v1 || return 1
    fi
    if _internal_install_read_manifest "$_internal_install_manifest"; then
        _internal_install_manifest_expected=$(_internal_install_path_status "$_internal_install_manifest") || {
            _internal_install_report_v1_backup
            return 1
        }
    else
        : > "$_internal_install_work/prior" || {
            _internal_install_report_v1_backup
            return 1
        }
        _internal_install_manifest_expected=absent
        _internal_install_metadata_parent=$_internal_install_destination/.coderail
        _internal_install_metadata_status=$(_internal_install_path_status "$_internal_install_metadata_parent") || {
            _internal_install_report_v1_backup
            return 1
        }
        if [ "$_internal_install_metadata_status" != absent ] && [ "$_internal_install_metadata_status" != directory ]; then
            _internal_install_collect_collision .coderail
        fi
        if [ "$(_internal_install_path_status "$_internal_install_manifest")" != absent ]; then
            _internal_install_collect_collision .coderail/install.manifest
        fi
    fi

    _internal_install_build_plan || {
        log_error "Failed to prepare internal installation plan"
        _internal_install_report_v1_backup
        return 1
    }
    _internal_install_validate_plan_parents || {
        _internal_install_report_v1_backup
        return 1
    }
    [ "$_internal_install_failed" -eq 0 ] || {
        _internal_install_report_v1_backup
        return 1
    }
    if ! _internal_install_apply_plan; then
        _internal_install_report_v1_backup
        return 1
    fi
}

#!/usr/bin/env sh

# Private harness ownership-manifest helpers. Records deliberately contain only
# tabs as separators; payload paths with tabs or newlines are rejected by the
# shared path validator before they become ownership data.

_harness_manifest_tab=$(printf '\t')

_harness_manifest_name_valid()
{
    case "$1" in
        codex|claude|copilot|gemini) return 0 ;;
        *) return 1 ;;
    esac
}

_harness_manifest_home_valid()
{
    case "$1" in
        /*) ;;
        *) return 1 ;;
    esac
    _harness_manifest_newline='
'
    case "$1" in
        *"$_harness_manifest_tab"*|*"$_harness_manifest_newline"*|*//*|*/./*|*/../*|*/.|*/..) return 1 ;;
    esac
}

harness_manifest_path()
{
    [ "$#" -eq 2 ] || return 1
    _harness_manifest_home_valid "$1" || return 1
    _harness_manifest_name_valid "$2" || return 1
    printf '%s/.coderail/harnesses/%s.manifest\n' "${1%/}" "$2"
}

_harness_manifest_records_valid()
{
    _harness_manifest_records=$1
    _harness_manifest_harness=$2
    [ -f "$_harness_manifest_records" ] && [ ! -L "$_harness_manifest_records" ] && \
        [ -r "$_harness_manifest_records" ] || return 1
    [ ! -s "$_harness_manifest_records" ] || \
        [ "$(tail -c 1 "$_harness_manifest_records" 2>/dev/null)" = '' ] || return 1

    awk -v "FS=$_harness_manifest_tab" 'NF != 3 { exit 1 }' \
        "$_harness_manifest_records" || return 1
    while IFS="$_harness_manifest_tab" read -r _harness_manifest_path_record \
        _harness_manifest_checksum _harness_manifest_length _harness_manifest_extra || \
        [ -n "$_harness_manifest_path_record$_harness_manifest_checksum$_harness_manifest_length$_harness_manifest_extra" ]; do
        [ -n "$_harness_manifest_path_record" ] && [ -z "$_harness_manifest_extra" ] || return 1
        _harness_manifest_checked_path=$(path_manifest_relative "$_harness_manifest_path_record" \
            "harness:$_harness_manifest_harness") || return 1
        [ "$_harness_manifest_checked_path" = "$_harness_manifest_path_record" ] || return 1
        case "$_harness_manifest_checksum" in ''|*[!0-9]*) return 1 ;; esac
        case "$_harness_manifest_length" in ''|*[!0-9]*) return 1 ;; esac
    done < "$_harness_manifest_records"
}

_harness_manifest_metadata_parent_valid()
{
    _harness_manifest_metadata_home=$1
    _harness_manifest_metadata_path=$_harness_manifest_metadata_home
    for _harness_manifest_metadata_part in .coderail harnesses; do
        _harness_manifest_metadata_path=$_harness_manifest_metadata_path/$_harness_manifest_metadata_part
        [ ! -L "$_harness_manifest_metadata_path" ] || return 1
        if [ -e "$_harness_manifest_metadata_path" ]; then
            [ -d "$_harness_manifest_metadata_path" ] || return 1
        fi
    done
}

_harness_manifest_ensure_metadata_parent()
{
    _harness_manifest_metadata_home=$1
    [ -d "$_harness_manifest_metadata_home" ] && [ ! -L "$_harness_manifest_metadata_home" ] || return 1
    _harness_manifest_metadata_path=$_harness_manifest_metadata_home
    for _harness_manifest_metadata_part in .coderail harnesses; do
        _harness_manifest_metadata_path=$_harness_manifest_metadata_path/$_harness_manifest_metadata_part
        [ ! -L "$_harness_manifest_metadata_path" ] || return 1
        if [ -e "$_harness_manifest_metadata_path" ]; then
            [ -d "$_harness_manifest_metadata_path" ] || return 1
        else
            mkdir "$_harness_manifest_metadata_path" 2>/dev/null || return 1
            [ -d "$_harness_manifest_metadata_path" ] && [ ! -L "$_harness_manifest_metadata_path" ] || return 1
        fi
    done
}

# Read a manifest into a path/checksum/length records file. Returns 2 when the
# manifest is absent, and 1 for malformed or unsafe metadata.
harness_manifest_read()
{
    [ "$#" -eq 3 ] || return 1
    _harness_manifest_home_valid "$1" || return 1
    _harness_manifest_name_valid "$2" || return 1
    _harness_manifest_output=$3
    _harness_manifest_file=$(harness_manifest_path "$1" "$2") || return 1
    _harness_manifest_metadata_parent_valid "$1" || return 1

    if [ ! -e "$_harness_manifest_file" ]; then
        [ ! -L "$_harness_manifest_file" ] || return 1
        return 2
    fi
    [ -f "$_harness_manifest_file" ] && [ ! -L "$_harness_manifest_file" ] && \
        [ -r "$_harness_manifest_file" ] || return 1
    [ -s "$_harness_manifest_file" ] || return 1
    [ "$(tail -c 1 "$_harness_manifest_file" 2>/dev/null)" = '' ] || return 1

    IFS= read -r _harness_manifest_header < "$_harness_manifest_file" || return 1
    [ "$_harness_manifest_header" = "coderail-harness-manifest$_harness_manifest_tab"'1'"$_harness_manifest_tab$2" ] || return 1
    sed '1d' "$_harness_manifest_file" > "$_harness_manifest_output" || return 1
    _harness_manifest_records_valid "$_harness_manifest_output" "$2" || return 1
    LC_ALL=C sort -c -t "$_harness_manifest_tab" -k1,1 -u "$_harness_manifest_output" 2>/dev/null || return 1
}

# Atomically publish a sorted version-1 snapshot. The caller supplies records
# as path/checksum/length lines; duplicate paths are rejected rather than
# silently adopting one claim over another.
harness_manifest_write()
{
    [ "$#" -eq 3 ] || return 1
    _harness_manifest_home_valid "$1" || return 1
    _harness_manifest_name_valid "$2" || return 1
    _harness_manifest_records_valid "$3" "$2" || return 1
    _harness_manifest_home=$1
    _harness_manifest_harness=$2
    _harness_manifest_records=$3
    _harness_manifest_file=$(harness_manifest_path "$_harness_manifest_home" "$_harness_manifest_harness") || return 1
    _harness_manifest_metadata_parent_valid "$_harness_manifest_home" || return 1

    if [ -e "$_harness_manifest_file" ] || [ -L "$_harness_manifest_file" ]; then
        _harness_manifest_check=$(mktemp "${TMPDIR:-/tmp}/coderail-harness-read.XXXXXX" 2>/dev/null) || return 1
        harness_manifest_read "$_harness_manifest_home" "$_harness_manifest_harness" "$_harness_manifest_check"
        _harness_manifest_read_status=$?
        rm -f "$_harness_manifest_check"
        [ "$_harness_manifest_read_status" -eq 0 ] || return 1
        _harness_manifest_records=$3
    fi

    _harness_manifest_ensure_metadata_parent "$_harness_manifest_home" || return 1
    _harness_manifest_parent=${_harness_manifest_file%/*}
    _harness_manifest_sorted=$(mktemp "$_harness_manifest_parent/.${_harness_manifest_harness}.records.XXXXXX" 2>/dev/null) || return 1
    _harness_manifest_snapshot=$(mktemp "$_harness_manifest_parent/.${_harness_manifest_harness}.manifest.XXXXXX" 2>/dev/null) || {
        rm -f "$_harness_manifest_sorted"
        return 1
    }
    if ! LC_ALL=C sort -t "$_harness_manifest_tab" -k1,1 -u "$_harness_manifest_records" > "$_harness_manifest_sorted" || \
        [ "$(wc -l < "$_harness_manifest_sorted")" -ne "$(wc -l < "$_harness_manifest_records")" ] || \
        ! { printf 'coderail-harness-manifest\t1\t%s\n' "$_harness_manifest_harness"; cat "$_harness_manifest_sorted"; } > "$_harness_manifest_snapshot" || \
        ! mv -f "$_harness_manifest_snapshot" "$_harness_manifest_file"; then
        rm -f "$_harness_manifest_sorted" "$_harness_manifest_snapshot"
        return 1
    fi
    rm -f "$_harness_manifest_sorted"
}

harness_manifest_remove()
{
    [ "$#" -eq 2 ] || return 1
    _harness_manifest_file=$(harness_manifest_path "$1" "$2") || return 1
    _harness_manifest_check=$(mktemp "${TMPDIR:-/tmp}/coderail-harness-read.XXXXXX" 2>/dev/null) || return 1
    harness_manifest_read "$1" "$2" "$_harness_manifest_check"
    _harness_manifest_status=$?
    rm -f "$_harness_manifest_check"
    [ "$_harness_manifest_status" -eq 0 ] || return 1
    rm -f "$_harness_manifest_file"
}

_harness_lifecycle_output()
{
    if command -v output >/dev/null 2>&1; then
        output "$1"
    fi
}

_harness_lifecycle_state_set()
{
    _harness_lifecycle_relative=$1
    _harness_lifecycle_sum=$2
    _harness_lifecycle_length=$3
    _harness_lifecycle_state=$4
    _harness_lifecycle_next=$(mktemp "$(dirname "$_harness_lifecycle_state")/.state.XXXXXX" 2>/dev/null) || return 1
    awk -F "$_harness_manifest_tab" -v p="$_harness_lifecycle_relative" '$1 != p { print }' \
        "$_harness_lifecycle_state" > "$_harness_lifecycle_next" || {
        rm -f "$_harness_lifecycle_next"
        return 1
    }
    printf '%s\t%s\t%s\n' "$_harness_lifecycle_relative" "$_harness_lifecycle_sum" \
        "$_harness_lifecycle_length" >> "$_harness_lifecycle_next" || {
        rm -f "$_harness_lifecycle_next"
        return 1
    }
    LC_ALL=C sort -t "$_harness_manifest_tab" -k1,1 -u "$_harness_lifecycle_next" > \
        "$_harness_lifecycle_next.sorted" || {
        rm -f "$_harness_lifecycle_next" "$_harness_lifecycle_next.sorted"
        return 1
    }
    mv "$_harness_lifecycle_next.sorted" "$_harness_lifecycle_state" || {
        rm -f "$_harness_lifecycle_next" "$_harness_lifecycle_next.sorted"
        return 1
    }
    rm -f "$_harness_lifecycle_next"
}

_harness_lifecycle_state_remove()
{
    _harness_lifecycle_relative=$1
    _harness_lifecycle_state=$2
    _harness_lifecycle_next=$(mktemp "$(dirname "$_harness_lifecycle_state")/.state.XXXXXX" 2>/dev/null) || return 1
    awk -F "$_harness_manifest_tab" -v p="$_harness_lifecycle_relative" '$1 != p { print }' \
        "$_harness_lifecycle_state" > "$_harness_lifecycle_next" || {
        rm -f "$_harness_lifecycle_next"
        return 1
    }
    [ "$(wc -l < "$_harness_lifecycle_next")" -lt "$(wc -l < "$_harness_lifecycle_state")" ] || {
        rm -f "$_harness_lifecycle_next"
        return 1
    }
    mv "$_harness_lifecycle_next" "$_harness_lifecycle_state"
}

_harness_lifecycle_publish_state()
{
    _harness_lifecycle_home=$1
    _harness_lifecycle_harness=$2
    _harness_lifecycle_state=$3
    if [ -s "$_harness_lifecycle_state" ]; then
        harness_manifest_write "$_harness_lifecycle_home" "$_harness_lifecycle_harness" \
            "$_harness_lifecycle_state"
    else
        harness_manifest_remove "$_harness_lifecycle_home" "$_harness_lifecycle_harness"
    fi
}

_harness_lifecycle_manifest_matches_state()
{
    _harness_lifecycle_home=$1
    _harness_lifecycle_harness=$2
    _harness_lifecycle_state=$3
    _harness_lifecycle_current=$(mktemp "${TMPDIR:-/tmp}/coderail-harness-read.XXXXXX" 2>/dev/null) || return 1
    if harness_manifest_read "$_harness_lifecycle_home" "$_harness_lifecycle_harness" \
        "$_harness_lifecycle_current" >/dev/null 2>&1; then
        _harness_lifecycle_status=0
    else
        _harness_lifecycle_status=$?
    fi
    if { [ "$_harness_lifecycle_status" -eq 0 ] && cmp "$_harness_lifecycle_state" \
        "$_harness_lifecycle_current" >/dev/null 2>&1; } || \
        { [ "$_harness_lifecycle_status" -eq 2 ] && [ ! -s "$_harness_lifecycle_state" ]; }; then
        rm -f "$_harness_lifecycle_current"
        return 0
    fi
    rm -f "$_harness_lifecycle_current"
    return 1
}

_harness_lifecycle_report_unattempted()
{
    _harness_lifecycle_after=$1
    _harness_lifecycle_actions=$2
    _harness_lifecycle_seen=0
    while IFS="$_harness_manifest_tab" read -r _harness_lifecycle_action _harness_lifecycle_relative \
        _harness_lifecycle_rest; do
        if [ "$_harness_lifecycle_seen" -eq 1 ]; then
            _harness_lifecycle_output "not attempted: $_harness_lifecycle_relative"
        elif [ "$_harness_lifecycle_relative" = "$_harness_lifecycle_after" ]; then
            _harness_lifecycle_seen=1
        fi
    done < "$_harness_lifecycle_actions"
}

_harness_lifecycle_stop()
{
    _harness_lifecycle_output "failed: $1$2"
    _harness_lifecycle_report_unattempted "$1" "$3"
    return 1
}

# First-install preparation intentionally accepts only absent manifests and
# destinations. Reconciliation of an existing installation belongs to the
# later refresh lifecycle.
_harness_install_destination_root()
{
    _harness_install_raw_home=$1
    _harness_install_tab=$(printf '\t')
    _harness_install_newline='
'
    case "$_harness_install_raw_home" in
        /*) _harness_install_home=$_harness_install_raw_home ;;
        *) return 1 ;;
    esac
    while [ "$_harness_install_home" != / ] && \
        [ "${_harness_install_home%/}" != "$_harness_install_home" ]; do
        _harness_install_home=${_harness_install_home%/}
    done
    case "$_harness_install_home" in
        *"$_harness_install_tab"*|*"$_harness_install_newline"*|*//*|*/./*|*/../*|*/.|*/..) return 1 ;;
    esac

    _harness_install_probe=$_harness_install_home
    _harness_install_missing=
    while [ ! -e "$_harness_install_probe" ] && [ ! -L "$_harness_install_probe" ]; do
        _harness_install_part=${_harness_install_probe##*/}
        if [ -n "$_harness_install_missing" ]; then
            _harness_install_missing=$_harness_install_part/$_harness_install_missing
        else
            _harness_install_missing=$_harness_install_part
        fi
        _harness_install_parent=$(dirname "$_harness_install_probe") || return 1
        [ "$_harness_install_parent" != "$_harness_install_probe" ] || return 1
        _harness_install_probe=$_harness_install_parent
    done
    [ -d "$_harness_install_probe" ] && [ ! -L "$_harness_install_probe" ] || return 1
    _harness_install_parent=$(CDPATH= cd -P "$_harness_install_probe" 2>/dev/null && pwd) || return 1
    if [ -n "$_harness_install_missing" ]; then
        printf '%s/%s\n' "$_harness_install_parent" "$_harness_install_missing"
    else
        printf '%s\n' "$_harness_install_parent"
    fi
}

_harness_install_safe_parent()
{
    _harness_install_parent=$(dirname "$1") || return 1
    while :; do
        [ ! -L "$_harness_install_parent" ] || return 1
        if [ -e "$_harness_install_parent" ]; then
            [ -d "$_harness_install_parent" ] || return 1
        fi
        [ "$_harness_install_parent" = "$2" ] && return 0
        [ "$_harness_install_parent" != / ] || return 0
        _harness_install_parent=$(dirname "$_harness_install_parent") || return 1
    done
}

_harness_install_ensure_directory()
(
    _harness_install_directory=$1
    [ "$_harness_install_directory" = / ] && exit 0
    [ ! -L "$_harness_install_directory" ] || exit 1
    if [ -e "$_harness_install_directory" ]; then
        [ -d "$_harness_install_directory" ]
        exit
    fi
    _harness_install_ensure_directory "$(dirname "$_harness_install_directory")" || exit 1
    mkdir "$_harness_install_directory" 2>/dev/null || exit 1
    [ -d "$_harness_install_directory" ] && [ ! -L "$_harness_install_directory" ]
)

_harness_install_stage_inventory()
{
    _harness_install_stage=$1
    _harness_install_harness=$2
    _harness_install_inventory=$3
    [ -d "$_harness_install_stage" ] && [ ! -L "$_harness_install_stage" ] || return 1
    find "$_harness_install_stage" \( -type l -o \( ! -type d -a ! -type f \) \) -print | \
        grep . >/dev/null && return 1
    : > "$_harness_install_inventory" || return 1
    find "$_harness_install_stage" -type f -print | LC_ALL=C sort | while IFS= read -r _harness_install_source || \
        [ -n "$_harness_install_source" ]; do
        _harness_install_relative=${_harness_install_source#"$_harness_install_stage/"}
        _harness_install_relative=$(path_manifest_relative "$_harness_install_relative" \
            "harness:$_harness_install_harness") || exit 1
        [ -f "$_harness_install_source" ] && [ ! -L "$_harness_install_source" ] && \
            [ -r "$_harness_install_source" ] || exit 1
        _harness_install_checksum=$(path_checksum "$_harness_install_source") || exit 1
        printf '%s\t%s\t%s\t%s\n' "$_harness_install_relative" \
            "${_harness_install_checksum% *}" "${_harness_install_checksum#* }" \
            "$_harness_install_source" || exit 1
    done > "$_harness_install_inventory" || return 1
    [ -s "$_harness_install_inventory" ] || return 1
}

# Plan an installation without changing the harness home. $4 is an empty
# caller-owned work directory. Decisions for edited files are made here so a
# failed confirmation cannot leave a partial installation behind.
_harness_install_leaf_state()
{
    _harness_install_target=$1
    _harness_install_sum=$2
    _harness_install_length=$3
    if [ ! -e "$_harness_install_target" ] && [ ! -L "$_harness_install_target" ]; then
        printf '%s\n' absent
    elif [ -f "$_harness_install_target" ] && [ ! -L "$_harness_install_target" ]; then
        _harness_install_current=$(path_checksum "$_harness_install_target") || return 1
        if [ "$_harness_install_current" = "$_harness_install_sum $_harness_install_length" ]; then
            printf '%s\n' same
        else
            printf '%s\n' edited
        fi
    elif [ -L "$_harness_install_target" ]; then
        printf '%s\n' edited
    else
        printf '%s\n' invalid
    fi
}

_harness_install_edit_decision()
{
    _harness_install_force=$1
    _harness_install_yes=$2
    _harness_install_question=$3
    [ "$_harness_install_force" -eq 1 ] || { printf '%s\n' preserve; return 0; }
    [ "$_harness_install_yes" -eq 1 ] && { printf '%s\n' approve; return 0; }
    if log_confirm "$_harness_install_question"; then
        printf '%s\n' approve
        return 0
    elif [ "$?" -eq 1 ]; then
        printf '%s\n' preserve
        return 0
    fi
    log_error "Confirmation failed; retry with --force --yes."
    return 1
}

# Validate claims for every selected plan before the first home is changed.
# A claim is a file, never a directory: shared and nested homes are therefore
# valid until two payloads (or payload and metadata) actually overlap.
harness_plans_validate()
{
    [ "$#" -gt 0 ] || return 1
    _harness_plans_claims=$(mktemp "${TMPDIR:-/tmp}/coderail-harness-claims.XXXXXX" 2>/dev/null) || return 1
    for _harness_plans_work in "$@"; do
        [ -f "$_harness_plans_work/plan" ] || { rm -f "$_harness_plans_claims"; return 1; }
        IFS= read -r _harness_plans_name < "$_harness_plans_work/plan" || { rm -f "$_harness_plans_claims"; return 1; }
        _harness_plans_home=$(sed -n '2p' "$_harness_plans_work/plan") || { rm -f "$_harness_plans_claims"; return 1; }
        case "$_harness_plans_name" in absent) continue ;; esac
        _harness_manifest_name_valid "$_harness_plans_name" || { rm -f "$_harness_plans_claims"; return 1; }
        _harness_plans_manifest=$(harness_manifest_path "$_harness_plans_home" "$_harness_plans_name") || { rm -f "$_harness_plans_claims"; return 1; }
        printf '%s\t%s\n' "$_harness_plans_manifest" "$_harness_plans_name:metadata" >> "$_harness_plans_claims" || { rm -f "$_harness_plans_claims"; return 1; }
        if [ -f "$_harness_plans_work/records" ]; then
            while IFS="$_harness_manifest_tab" read -r _harness_plans_relative _harness_plans_sum _harness_plans_length; do
                _harness_plans_target=$(path_manifest_target "$_harness_plans_home" "$_harness_plans_relative" "harness:$_harness_plans_name") || { rm -f "$_harness_plans_claims"; return 1; }
                printf '%s\t%s\n' "$_harness_plans_target" "$_harness_plans_name:$_harness_plans_relative" >> "$_harness_plans_claims" || { rm -f "$_harness_plans_claims"; return 1; }
            done < "$_harness_plans_work/records"
        elif [ -f "$_harness_plans_work/prior" ]; then
            while IFS="$_harness_manifest_tab" read -r _harness_plans_relative _harness_plans_sum _harness_plans_length; do
                _harness_plans_target=$(path_manifest_target "$_harness_plans_home" "$_harness_plans_relative" "harness:$_harness_plans_name") || { rm -f "$_harness_plans_claims"; return 1; }
                printf '%s\t%s\n' "$_harness_plans_target" "$_harness_plans_name:$_harness_plans_relative" >> "$_harness_plans_claims" || { rm -f "$_harness_plans_claims"; return 1; }
            done < "$_harness_plans_work/prior"
        fi
    done
    LC_ALL=C sort -t "$_harness_manifest_tab" -k1,1 "$_harness_plans_claims" | awk -F "$_harness_manifest_tab" '
        NR > 1 && ($1 == prior || index($1, prior "/") == 1 || index(prior, $1 "/") == 1) { exit 1 }
        { prior = $1 }
    ' || { rm -f "$_harness_plans_claims"; return 1; }
    rm -f "$_harness_plans_claims"
}

harness_install_prepare()
{
    [ "$#" -eq 6 ] || return 1
    _harness_manifest_name_valid "$1" || return 1
    _harness_install_harness=$1
    _harness_install_home=$(_harness_install_destination_root "$2") || return 1
    _harness_install_bundle=$3
    _harness_install_work=$4
    _harness_install_force=$5
    _harness_install_yes=$6
    case "$_harness_install_force:$_harness_install_yes" in 0:0|0:1|1:0|1:1) ;; *) return 1 ;; esac
    [ -d "$_harness_install_work" ] && [ ! -L "$_harness_install_work" ] || return 1
    [ -z "$(find "$_harness_install_work" -print 2>/dev/null | sed '1d;2q')" ] || return 1
    _harness_install_stage=$(mktemp -d "${TMPDIR:-/tmp}/coderail-harness.XXXXXX" 2>/dev/null) || return 1
    case "$_harness_install_stage" in "$_harness_install_home"|"$_harness_install_home"/*) rm -rf "$_harness_install_stage"; return 1 ;; esac
    harness_render "$_harness_install_harness" "$_harness_install_bundle" \
        "$_harness_install_stage" || { rm -rf "$_harness_install_stage"; return 1; }
    mv "$_harness_install_stage" "$_harness_install_work/stage" || { rm -rf "$_harness_install_stage"; return 1; }
    _harness_install_stage=$_harness_install_work/stage
    _harness_install_stage_inventory "$_harness_install_stage" "$_harness_install_harness" \
        "$_harness_install_work/inventory" || return 1
    if harness_manifest_read "$_harness_install_home" "$_harness_install_harness" \
        "$_harness_install_work/prior" >/dev/null 2>&1; then
        _harness_install_manifest_status=0
    else
        _harness_install_manifest_status=$?
    fi
    case "$_harness_install_manifest_status" in 0|2) ;; *) return 1 ;; esac
    [ "$_harness_install_manifest_status" -eq 0 ] || : > "$_harness_install_work/prior" || return 1
    : > "$_harness_install_work/actions" || return 1
    : > "$_harness_install_work/records" || return 1
    while IFS="$_harness_manifest_tab" read -r _harness_install_relative _harness_install_sum \
        _harness_install_length _harness_install_source; do
        _harness_install_target=$(path_manifest_target "$_harness_install_home" \
            "$_harness_install_relative" "harness:$_harness_install_harness") || return 1
        _harness_install_safe_parent "$_harness_install_target" "$_harness_install_home" || return 1
        _harness_install_prior=$(awk -F "$_harness_manifest_tab" -v p="$_harness_install_relative" \
            '$1 == p { print $2 "\t" $3; exit }' "$_harness_install_work/prior") || return 1
        if [ -z "$_harness_install_prior" ]; then
            [ ! -e "$_harness_install_target" ] && [ ! -L "$_harness_install_target" ] || return 1
            _harness_install_action=create
            _harness_install_state=absent
        else
            IFS="$_harness_manifest_tab" read -r _harness_install_old_sum _harness_install_old_length <<EOF
$_harness_install_prior
EOF
            _harness_install_state=$(_harness_install_leaf_state "$_harness_install_target" \
                "$_harness_install_old_sum" "$_harness_install_old_length") || return 1
            case "$_harness_install_state" in
                absent) _harness_install_action=create ;;
                same)
                    if [ "$_harness_install_old_sum $_harness_install_old_length" = \
                        "$_harness_install_sum $_harness_install_length" ]; then
                        _harness_install_action=unchanged
                    else
                        _harness_install_action=refresh
                    fi
                    ;;
                edited)
                    _harness_install_current=$(path_checksum "$_harness_install_target" 2>/dev/null || :)
                    if [ "$_harness_install_current" = "$_harness_install_sum $_harness_install_length" ]; then
                        _harness_install_action=refresh
                        _harness_install_state=staged
                    else
                        _harness_install_decision=$(_harness_install_edit_decision "$_harness_install_force" \
                            "$_harness_install_yes" "Replace edited $_harness_install_relative?") || return 1
                        [ "$_harness_install_decision" = approve ] && _harness_install_action=refresh || _harness_install_action=preserve
                    fi
                    ;;
                *) return 1 ;;
            esac
        fi
        printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$_harness_install_action" "$_harness_install_relative" \
            "$_harness_install_sum" "$_harness_install_length" "$_harness_install_state" "$_harness_install_source" >> "$_harness_install_work/actions" || return 1
        case "$_harness_install_action" in
            preserve)
                printf '%s\t%s\t%s\n' "$_harness_install_relative" "$_harness_install_old_sum" "$_harness_install_old_length" >> "$_harness_install_work/records" || return 1 ;;
            *) printf '%s\t%s\t%s\n' "$_harness_install_relative" "$_harness_install_sum" "$_harness_install_length" >> "$_harness_install_work/records" || return 1 ;;
        esac
    done < "$_harness_install_work/inventory"
    if [ "$_harness_install_manifest_status" -eq 0 ]; then
        while IFS="$_harness_manifest_tab" read -r _harness_install_relative _harness_install_old_sum _harness_install_old_length; do
            awk -F "$_harness_manifest_tab" -v p="$_harness_install_relative" '$1 == p { found = 1 } END { exit !found }' \
                "$_harness_install_work/inventory" && continue
            _harness_install_target=$(path_manifest_target "$_harness_install_home" "$_harness_install_relative" "harness:$_harness_install_harness") || return 1
            _harness_install_safe_parent "$_harness_install_target" "$_harness_install_home" || return 1
            _harness_install_state=$(_harness_install_leaf_state "$_harness_install_target" "$_harness_install_old_sum" "$_harness_install_old_length") || return 1
            case "$_harness_install_state" in
                absent) _harness_install_action=release ;;
                same) _harness_install_action=remove ;;
                edited)
                    _harness_install_decision=$(_harness_install_edit_decision "$_harness_install_force" "$_harness_install_yes" "Remove edited $_harness_install_relative?") || return 1
                    [ "$_harness_install_decision" = approve ] && _harness_install_action=remove || _harness_install_action=release
                    ;;
                *) return 1 ;;
            esac
            printf '%s\t%s\t-\t-\t%s\t-\n' "$_harness_install_action" "$_harness_install_relative" "$_harness_install_state" >> "$_harness_install_work/actions" || return 1
        done < "$_harness_install_work/prior"
    fi
    LC_ALL=C sort -t "$_harness_manifest_tab" -k2,2 "$_harness_install_work/actions" > "$_harness_install_work/actions.sorted" || return 1
    mv "$_harness_install_work/actions.sorted" "$_harness_install_work/actions" || return 1
    printf '%s\n%s\n' "$_harness_install_harness" "$_harness_install_home" > "$_harness_install_work/plan" || return 1
}

harness_install_apply()
{
    [ "$#" -eq 1 ] || return 1
    _harness_install_work=$1
    [ -f "$_harness_install_work/plan" ] && [ -f "$_harness_install_work/actions" ] && \
        [ -f "$_harness_install_work/records" ] || return 1
    IFS= read -r _harness_install_harness < "$_harness_install_work/plan" || return 1
    _harness_install_home=$(sed -n '2p' "$_harness_install_work/plan") || return 1
    _harness_install_destination_root "$_harness_install_home" >/dev/null || return 1
    _harness_lifecycle_manifest_matches_state "$_harness_install_home" \
        "$_harness_install_harness" "$_harness_install_work/prior" || return 1
    cp "$_harness_install_work/prior" "$_harness_install_work/state" || return 1
    _harness_install_ensure_directory "$_harness_install_home" || return 1
    while IFS="$_harness_manifest_tab" read -r _harness_install_action _harness_install_relative \
        _harness_install_sum _harness_install_length _harness_install_expected _harness_install_source; do
        _harness_lifecycle_manifest_matches_state "$_harness_install_home" \
            "$_harness_install_harness" "$_harness_install_work/state" || {
            _harness_lifecycle_stop "$_harness_install_relative" " (manifest changed after preflight)" \
                "$_harness_install_work/actions"
            return 1
        }
        _harness_install_target=$(path_manifest_target "$_harness_install_home" \
            "$_harness_install_relative" "harness:$_harness_install_harness") || {
            _harness_lifecycle_stop "$_harness_install_relative" "" "$_harness_install_work/actions"
            return 1
        }
        _harness_install_safe_parent "$_harness_install_target" "$_harness_install_home" || {
            _harness_lifecycle_stop "$_harness_install_relative" "" "$_harness_install_work/actions"
            return 1
        }
        case "$_harness_install_action" in
            create)
                _harness_install_current=$(_harness_install_leaf_state "$_harness_install_target" 0 0) || return 1
                [ "$_harness_install_current" = absent ] || return 1 ;;
            refresh)
                # Refreshes may have been prepared from either an unchanged
                # managed file or edited bytes already equal to the stage.
                if [ "$_harness_install_expected" = edited ]; then
                    _harness_install_current=$(_harness_install_leaf_state "$_harness_install_target" \
                        "$_harness_install_sum" "$_harness_install_length") || return 1
                    [ "$_harness_install_current" = edited ] || return 1
                else
                    _harness_install_current=$(path_checksum "$_harness_install_target") || return 1
                    [ "$_harness_install_current" = "$_harness_install_sum $_harness_install_length" ] || {
                    _harness_install_prior=$(awk -F "$_harness_manifest_tab" -v p="$_harness_install_relative" '$1 == p { print $2 " " $3; exit }' "$_harness_install_work/state") || return 1
                    [ "$_harness_install_current" = "$_harness_install_prior" ] || return 1
                    }
                fi ;;
            unchanged)
                _harness_install_current=$(_harness_install_leaf_state "$_harness_install_target" "$_harness_install_sum" "$_harness_install_length") || return 1
                [ "$_harness_install_current" = same ] || return 1 ;;
            preserve|remove|release)
                _harness_install_prior=$(awk -F "$_harness_manifest_tab" -v p="$_harness_install_relative" '$1 == p { print $2 "\t" $3; exit }' "$_harness_install_work/state") || return 1
                IFS="$_harness_manifest_tab" read -r _harness_install_old_sum _harness_install_old_length <<EOF
$_harness_install_prior
EOF
                _harness_install_current=$(_harness_install_leaf_state "$_harness_install_target" "$_harness_install_old_sum" "$_harness_install_old_length") || return 1
                [ "$_harness_install_current" = "$_harness_install_expected" ] || return 1 ;;
            *) return 1 ;;
        esac
        case "$_harness_install_action" in
            create|refresh)
                _harness_install_current=$(path_checksum "$_harness_install_source") || return 1
                [ "$_harness_install_current" = "$_harness_install_sum $_harness_install_length" ] || return 1
                _harness_install_ensure_directory "$(dirname "$_harness_install_target")" || return 1
                _harness_install_parent=$(dirname "$_harness_install_target") || return 1
                _harness_install_temp=$(mktemp "$_harness_install_parent/.coderail-install.XXXXXX" 2>/dev/null) || return 1
                if ! cp -p "$_harness_install_source" "$_harness_install_temp" || ! mv -f "$_harness_install_temp" "$_harness_install_target"; then
                    rm -f "$_harness_install_temp"
                    _harness_lifecycle_stop "$_harness_install_relative" "" "$_harness_install_work/actions"
                    return 1
                fi
                _harness_install_current=$(path_checksum "$_harness_install_target") || return 1
                [ "$_harness_install_current" = "$_harness_install_sum $_harness_install_length" ] || return 1
                _harness_lifecycle_state_set "$_harness_install_relative" \
                    "${_harness_install_current% *}" "${_harness_install_current#* }" \
                    "$_harness_install_work/state" || return 1
                _harness_lifecycle_publish_state "$_harness_install_home" "$_harness_install_harness" \
                    "$_harness_install_work/state" || {
                    _harness_lifecycle_stop "$_harness_install_relative" \
                        " changed, but its manifest snapshot was not published" \
                        "$_harness_install_work/actions"
                    return 1
                }
                _harness_lifecycle_output "$_harness_install_action: $_harness_install_relative" ;;
            unchanged)
                _harness_lifecycle_output "unchanged: $_harness_install_relative" ;;
            preserve)
                _harness_lifecycle_output "preserved: $_harness_install_relative" ;;
            release)
                _harness_lifecycle_state_remove "$_harness_install_relative" \
                    "$_harness_install_work/state" || return 1
                _harness_lifecycle_publish_state "$_harness_install_home" "$_harness_install_harness" \
                    "$_harness_install_work/state" || return 1
                case "$_harness_install_expected" in
                    absent) _harness_lifecycle_output "already absent: $_harness_install_relative" ;;
                    *) _harness_lifecycle_output "preserved: $_harness_install_relative" ;;
                esac ;;
            remove)
                rm -f "$_harness_install_target" || {
                    _harness_lifecycle_stop "$_harness_install_relative" "" "$_harness_install_work/actions"
                    return 1
                }
                _harness_lifecycle_state_remove "$_harness_install_relative" \
                    "$_harness_install_work/state" || return 1
                _harness_lifecycle_publish_state "$_harness_install_home" "$_harness_install_harness" \
                    "$_harness_install_work/state" || {
                    _harness_lifecycle_stop "$_harness_install_relative" \
                        " removed, but its manifest snapshot was not published" \
                        "$_harness_install_work/actions"
                    return 1
                }
                _harness_lifecycle_output "removed: $_harness_install_relative" ;;
            *) return 1 ;;
        esac
    done < "$_harness_install_work/actions"
}

# Plan removal from the manifest alone.  Unlike installation, this deliberately
# never renders a bundle or creates the configured home.
_harness_uninstall_leaf_state()
{
    _harness_uninstall_target=$1
    _harness_uninstall_sum=$2
    _harness_uninstall_length=$3
    if [ ! -e "$_harness_uninstall_target" ] && [ ! -L "$_harness_uninstall_target" ]; then
        printf '%s\n' absent
    elif [ -f "$_harness_uninstall_target" ] && [ ! -L "$_harness_uninstall_target" ]; then
        _harness_uninstall_current=$(path_checksum "$_harness_uninstall_target") || return 1
        if [ "$_harness_uninstall_current" = "$_harness_uninstall_sum $_harness_uninstall_length" ]; then
            printf '%s\n' same
        else
            printf 'edited:%s\n' "${_harness_uninstall_current% *}:${_harness_uninstall_current#* }"
        fi
    elif [ -L "$_harness_uninstall_target" ]; then
        printf '%s\n' link
    else
        printf '%s\n' invalid
    fi
}

harness_uninstall_prepare()
{
    [ "$#" -eq 5 ] || return 1
    _harness_manifest_name_valid "$1" || return 1
    _harness_uninstall_harness=$1
    _harness_uninstall_home=$(_harness_install_destination_root "$2") || return 1
    _harness_uninstall_work=$3
    _harness_uninstall_force=$4
    _harness_uninstall_yes=$5
    case "$_harness_uninstall_force:$_harness_uninstall_yes" in 0:0|0:1|1:0|1:1) ;; *) return 1 ;; esac
    [ -d "$_harness_uninstall_work" ] && [ ! -L "$_harness_uninstall_work" ] || return 1
    [ -z "$(find "$_harness_uninstall_work" -print 2>/dev/null | sed '1d;2q')" ] || return 1
    if harness_manifest_read "$_harness_uninstall_home" "$_harness_uninstall_harness" \
        "$_harness_uninstall_work/prior" >/dev/null 2>&1; then
        _harness_uninstall_manifest_status=0
    else
        _harness_uninstall_manifest_status=$?
    fi
    case "$_harness_uninstall_manifest_status" in
        0) ;;
        2) printf '%s\n%s\n' absent "$_harness_uninstall_harness" > "$_harness_uninstall_work/plan" || return 1; return 0 ;;
        *) return 1 ;;
    esac
    : > "$_harness_uninstall_work/actions" || return 1
    while IFS="$_harness_manifest_tab" read -r _harness_uninstall_relative _harness_uninstall_sum _harness_uninstall_length; do
        _harness_uninstall_target=$(path_manifest_target "$_harness_uninstall_home" \
            "$_harness_uninstall_relative" "harness:$_harness_uninstall_harness") || return 1
        _harness_install_safe_parent "$_harness_uninstall_target" "$_harness_uninstall_home" || return 1
        _harness_uninstall_state=$(_harness_uninstall_leaf_state "$_harness_uninstall_target" \
            "$_harness_uninstall_sum" "$_harness_uninstall_length") || return 1
        case "$_harness_uninstall_state" in
            absent|same) _harness_uninstall_action=remove ;;
            edited:*|link)
                _harness_uninstall_decision=$(_harness_install_edit_decision "$_harness_uninstall_force" \
                    "$_harness_uninstall_yes" "Remove edited $_harness_uninstall_relative?") || return 1
                [ "$_harness_uninstall_decision" = approve ] && _harness_uninstall_action=remove || _harness_uninstall_action=release
                ;;
            *) return 1 ;;
        esac
        printf '%s\t%s\t%s\t%s\t%s\n' "$_harness_uninstall_action" \
            "$_harness_uninstall_relative" "$_harness_uninstall_sum" "$_harness_uninstall_length" \
            "$_harness_uninstall_state" >> "$_harness_uninstall_work/actions" || return 1
    done < "$_harness_uninstall_work/prior"
    printf '%s\n%s\n' "$_harness_uninstall_harness" "$_harness_uninstall_home" > "$_harness_uninstall_work/plan" || return 1
}

harness_uninstall_apply()
{
    [ "$#" -eq 1 ] || return 1
    _harness_uninstall_work=$1
    [ -f "$_harness_uninstall_work/plan" ] || return 1
    IFS= read -r _harness_uninstall_harness < "$_harness_uninstall_work/plan" || return 1
    _harness_uninstall_home=$(sed -n '2p' "$_harness_uninstall_work/plan") || return 1
    [ "$_harness_uninstall_harness" = absent ] && return 0
    [ -f "$_harness_uninstall_work/prior" ] && [ -f "$_harness_uninstall_work/actions" ] || return 1
    _harness_install_destination_root "$_harness_uninstall_home" >/dev/null || return 1
    _harness_uninstall_current=$(mktemp "${TMPDIR:-/tmp}/coderail-harness-read.XXXXXX" 2>/dev/null) || return 1
    if ! harness_manifest_read "$_harness_uninstall_home" "$_harness_uninstall_harness" "$_harness_uninstall_current" || \
        ! cmp "$_harness_uninstall_work/prior" "$_harness_uninstall_current" >/dev/null 2>&1; then
        rm -f "$_harness_uninstall_current"
        return 1
    fi
    rm -f "$_harness_uninstall_current"
    cp "$_harness_uninstall_work/prior" "$_harness_uninstall_work/remaining" || return 1
    while IFS="$_harness_manifest_tab" read -r _harness_uninstall_action _harness_uninstall_relative \
        _harness_uninstall_sum _harness_uninstall_length _harness_uninstall_expected; do
        _harness_uninstall_target=$(path_manifest_target "$_harness_uninstall_home" \
            "$_harness_uninstall_relative" "harness:$_harness_uninstall_harness") || return 1
        _harness_install_safe_parent "$_harness_uninstall_target" "$_harness_uninstall_home" || return 1
        _harness_uninstall_state=$(_harness_uninstall_leaf_state "$_harness_uninstall_target" \
            "$_harness_uninstall_sum" "$_harness_uninstall_length") || return 1
        [ "$_harness_uninstall_state" = "$_harness_uninstall_expected" ] || return 1
        case "$_harness_uninstall_action" in
            remove)
                case "$_harness_uninstall_state" in same|link) rm -f "$_harness_uninstall_target" || return 1 ;; absent) ;; *) return 1 ;; esac
                ;;
            release) case "$_harness_uninstall_state" in edited:*|link) ;; *) return 1 ;; esac ;;
            *) return 1 ;;
        esac
        _harness_uninstall_next=$(mktemp "$_harness_uninstall_work/.remaining.XXXXXX" 2>/dev/null) || return 1
        awk -F "$_harness_manifest_tab" -v p="$_harness_uninstall_relative" '$1 != p { print }' \
            "$_harness_uninstall_work/remaining" > "$_harness_uninstall_next" || { rm -f "$_harness_uninstall_next"; return 1; }
        [ "$(wc -l < "$_harness_uninstall_next")" -lt "$(wc -l < "$_harness_uninstall_work/remaining")" ] || { rm -f "$_harness_uninstall_next"; return 1; }
        mv "$_harness_uninstall_next" "$_harness_uninstall_work/remaining" || return 1
        if [ -s "$_harness_uninstall_work/remaining" ]; then
            harness_manifest_write "$_harness_uninstall_home" "$_harness_uninstall_harness" \
                "$_harness_uninstall_work/remaining" || return 1
        else
            harness_manifest_remove "$_harness_uninstall_home" "$_harness_uninstall_harness" || return 1
        fi
        case "$_harness_uninstall_action:$_harness_uninstall_state" in
            remove:absent) _harness_lifecycle_output "already absent: $_harness_uninstall_relative" ;;
            remove:*) _harness_lifecycle_output "removed: $_harness_uninstall_relative" ;;
            release:*) _harness_lifecycle_output "preserved: $_harness_uninstall_relative" ;;
        esac
    done < "$_harness_uninstall_work/actions"
    if [ ! -s "$_harness_uninstall_work/actions" ]; then
        harness_manifest_remove "$_harness_uninstall_home" "$_harness_uninstall_harness" || return 1
    fi
}

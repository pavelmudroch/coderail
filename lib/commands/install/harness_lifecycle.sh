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

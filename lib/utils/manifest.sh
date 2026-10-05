#!/usr/bin/env sh

manifest_install()
{
    source_dir="$1"
    target_dir="$2"
    force="${3-0}"
    yes="${4-0}"

    manifest_file="$target_dir/.coderail-install"
    if ! temp_dir="$(fs_create_temp_dir 2>/dev/null)"; then
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    temp_manifest_file="$temp_dir/.coderail-install"
    if ! touch "$temp_manifest_file" 2>/dev/null; then
        exit "$_CR_ERROR_EXIT_CODE"
    fi
    # manifest file format: `checksum length relative-path` each file per line
}
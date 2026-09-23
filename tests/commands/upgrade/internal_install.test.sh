#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"

_make_source()
{
    fixture_root=$1
    mkdir -p "$fixture_root/source/bin" "$fixture_root/source/lib" "$fixture_root/source/instructions"
    printf '#!/usr/bin/env sh\nprintf source-program\n' > "$fixture_root/source/bin/cr"
    chmod 700 "$fixture_root/source/bin/cr"
    printf 'source-library\n' > "$fixture_root/source/lib/library"
    chmod 640 "$fixture_root/source/lib/library"
    printf 'source-guide\n' > "$fixture_root/source/instructions/guide"
    chmod 600 "$fixture_root/source/instructions/guide"
}

_run_internal()
{
    internal_source=$1
    internal_destination=$2
    shift 2
    CODERAIL_INTERNAL_INSTALL=1 \
        CODERAIL_INTERNAL_SOURCE="$internal_source" \
        CODERAIL_INTERNAL_DESTINATION="$internal_destination" \
        CODERAIL_INTERNAL_ORIGIN=upgrade \
        "$PROJECT_ROOT/bin/cr" --non-interactive upgrade "$@"
}

_run_forced_decline()
{
    decline_source=$1
    decline_destination=$2
    (
        . "$PROJECT_ROOT/lib/utils/path.sh"
        . "$PROJECT_ROOT/lib/commands/upgrade/internal_install.sh"
        log_error() { :; }
        output() { :; }
        log_confirm() { return 1; }
        CODERAIL_INTERNAL_INSTALL=1 \
            CODERAIL_INTERNAL_SOURCE="$decline_source" \
            CODERAIL_INTERNAL_DESTINATION="$decline_destination" \
            _internal_install 1 0
    )
}

_run_unavailable_confirmation()
{
    unavailable_source=$1
    unavailable_destination=$2
    (
        . "$PROJECT_ROOT/lib/utils/path.sh"
        . "$PROJECT_ROOT/lib/commands/upgrade/internal_install.sh"
        log_error() { printf 'error: %s\n' "$*" >&2; }
        output() { printf '%s\n' "$*"; }
        log_confirm() { return 2; }
        CODERAIL_INTERNAL_INSTALL=1 \
            CODERAIL_INTERNAL_SOURCE="$unavailable_source" \
            CODERAIL_INTERNAL_DESTINATION="$unavailable_destination" \
            CODERAIL_INTERNAL_ORIGIN=upgrade \
            _internal_install 1 0
    )
}

_run_mixed_confirmations()
{
    mixed_source=$1
    mixed_destination=$2
    (
        . "$PROJECT_ROOT/lib/utils/path.sh"
        . "$PROJECT_ROOT/lib/commands/upgrade/internal_install.sh"
        mixed_confirmation_count=0
        log_error() { printf 'error: %s\n' "$*" >&2; }
        output() { printf '%s\n' "$*"; }
        log_confirm()
        {
            mixed_confirmation_count=$((mixed_confirmation_count + 1))
            case "$mixed_confirmation_count" in
                1) return 0 ;;
                2) return 1 ;;
                *) return 2 ;;
            esac
        }
        CODERAIL_INTERNAL_INSTALL=1 \
            CODERAIL_INTERNAL_SOURCE="$mixed_source" \
            CODERAIL_INTERNAL_DESTINATION="$mixed_destination" \
            CODERAIL_INTERNAL_ORIGIN=install \
            _internal_install 1 0
    )
}

_run_with_late_precondition()
{
    late_source=$1
    late_destination=$2
    (
        . "$PROJECT_ROOT/lib/utils/path.sh"
        . "$PROJECT_ROOT/lib/commands/upgrade/internal_install.sh"
        log_error() { printf 'error: %s\n' "$*" >&2; }
        output()
        {
            printf '%s\n' "$*"
            if [ "$1" = 'updated: bin/cr' ]; then
                printf 'late local guide edit\n' > "$late_destination/instructions/guide"
            fi
        }
        log_confirm() { return 2; }
        CODERAIL_INTERNAL_INSTALL=1 \
            CODERAIL_INTERNAL_SOURCE="$late_source" \
            CODERAIL_INTERNAL_DESTINATION="$late_destination" \
            CODERAIL_INTERNAL_ORIGIN=upgrade \
            _internal_install 0 0
    )
}

_run_with_copy_failure()
{
    copy_failure_source=$(CDPATH= cd -P "$1" && pwd) || return 1
    copy_failure_destination=$2
    (
        . "$PROJECT_ROOT/lib/utils/path.sh"
        . "$PROJECT_ROOT/lib/commands/upgrade/internal_install.sh"
        log_error() { printf 'error: %s\n' "$*" >&2; }
        output() { printf '%s\n' "$*"; }
        log_confirm() { return 2; }
        cp()
        {
            if [ "$1" = -p ] && [ "$2" = "$copy_failure_source/instructions/guide" ]; then
                return 1
            fi
            command cp "$@"
        }
        CODERAIL_INTERNAL_INSTALL=1 \
            CODERAIL_INTERNAL_SOURCE="$copy_failure_source" \
            CODERAIL_INTERNAL_DESTINATION="$copy_failure_destination" \
            CODERAIL_INTERNAL_ORIGIN=upgrade \
            _internal_install 0 0
    )
}

_run_v1_confirmation()
{
    v1_source=$1
    v1_destination=$2
    v1_confirmation_status=$3
    (
        . "$PROJECT_ROOT/lib/utils/path.sh"
        . "$PROJECT_ROOT/lib/commands/upgrade/internal_install.sh"
        log_error() { printf 'error: %s\n' "$*" >&2; }
        output() { printf '%s\n' "$*"; }
        log_confirm() { return "$v1_confirmation_status"; }
        CODERAIL_INTERNAL_INSTALL=1 \
            CODERAIL_INTERNAL_SOURCE="$v1_source" \
            CODERAIL_INTERNAL_DESTINATION="$v1_destination" \
            CODERAIL_INTERNAL_ORIGIN=upgrade \
            _internal_install 0 0
    )
}

_run_v1_install()
{
    v1_source=$1
    v1_destination=$2
    CODERAIL_INTERNAL_INSTALL=1 \
        CODERAIL_INTERNAL_SOURCE="$v1_source" \
        CODERAIL_INTERNAL_DESTINATION="$v1_destination" \
        CODERAIL_INTERNAL_ORIGIN=install \
        "$PROJECT_ROOT/bin/cr" --non-interactive upgrade --yes
}

_run_v1_archive_failure()
{
    v1_source=$1
    v1_destination=$2
    (
        . "$PROJECT_ROOT/lib/utils/path.sh"
        . "$PROJECT_ROOT/lib/commands/upgrade/internal_install.sh"
        log_error() { printf 'error: %s\n' "$*" >&2; }
        output() { printf '%s\n' "$*"; }
        log_confirm() { return 0; }
        tar() { return 1; }
        CODERAIL_INTERNAL_INSTALL=1 \
            CODERAIL_INTERNAL_SOURCE="$v1_source" \
            CODERAIL_INTERNAL_DESTINATION="$v1_destination" \
            CODERAIL_INTERNAL_ORIGIN=upgrade \
            _internal_install 0 0
    )
}

_run_v1_copy_failure()
{
    v1_source=$1
    v1_destination=$2
    (
        . "$PROJECT_ROOT/lib/utils/path.sh"
        . "$PROJECT_ROOT/lib/commands/upgrade/internal_install.sh"
        log_error() { printf 'error: %s\n' "$*" >&2; }
        output() { printf '%s\n' "$*"; }
        log_confirm() { return 0; }
        cp() { return 1; }
        CODERAIL_INTERNAL_INSTALL=1 \
            CODERAIL_INTERNAL_SOURCE="$v1_source" \
            CODERAIL_INTERNAL_DESTINATION="$v1_destination" \
            CODERAIL_INTERNAL_ORIGIN=upgrade \
            _internal_install 0 0
    )
}

_checksum()
{
    cksum < "$1"
}

_file_mode()
{
    ls -ld "$1" | awk '{ print $1 }'
}

_test_fresh_install_and_deterministic_manifest()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    _make_source "$fixture_root"
    mkdir -p "$fixture_root/source/templates" "$fixture_root/source/tests"
    printf 'source-template\n' > "$fixture_root/source/templates/example"
    printf 'never install me\n' > "$fixture_root/source/tests/ignored"

    _run_internal "$fixture_root/source" "$fixture_root/destination" > "$fixture_root/first.out" || exit 1
    cmp "$fixture_root/source/bin/cr" "$fixture_root/destination/bin/cr" || exit 1
    cmp "$fixture_root/source/lib/library" "$fixture_root/destination/lib/library" || exit 1
    cmp "$fixture_root/source/instructions/guide" "$fixture_root/destination/instructions/guide" || exit 1
    cmp "$fixture_root/source/templates/example" "$fixture_root/destination/templates/example" || exit 1
    [ ! -e "$fixture_root/destination/tests/ignored" ] || exit 1
    [ "$(_file_mode "$fixture_root/source/bin/cr")" = "$(_file_mode "$fixture_root/destination/bin/cr")" ] || exit 1
    [ "$(_file_mode "$fixture_root/source/lib/library")" = "$(_file_mode "$fixture_root/destination/lib/library")" ] || exit 1

    manifest_before=$(_checksum "$fixture_root/destination/.coderail/install.manifest")
    guide_checksum=$(_checksum "$fixture_root/source/instructions/guide")
    guide_sum=${guide_checksum% *}
    guide_length=${guide_checksum#* }
    grep -Fqx "file	protected	instructions/guide	$guide_sum	$guide_length" \
        "$fixture_root/destination/.coderail/install.manifest" || exit 1
    grep -Fq 'file	protected	templates/example	' \
        "$fixture_root/destination/.coderail/install.manifest" || exit 1

    _run_internal "$fixture_root/source" "$fixture_root/destination" > "$fixture_root/second.out" || exit 1
    [ "$manifest_before" = "$(_checksum "$fixture_root/destination/.coderail/install.manifest")" ] || exit 1
    grep -Fqx 'unchanged: bin/cr' "$fixture_root/second.out" || exit 1
)

_test_replacement_protection_and_obsolete_release()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    _make_source "$fixture_root"
    mkdir "$fixture_root/destination"
    _run_internal "$fixture_root/source" "$fixture_root/destination" >/dev/null || exit 1
    guide_record=$(grep -F "$(printf 'file\tprotected\tinstructions/guide\t')" \
        "$fixture_root/destination/.coderail/install.manifest")

    printf 'local program edit\n' > "$fixture_root/destination/bin/cr"
    rm "$fixture_root/destination/lib/library"
    printf 'local guide edit\n' > "$fixture_root/destination/instructions/guide"
    printf '#!/usr/bin/env sh\nprintf updated-program\n' > "$fixture_root/source/bin/cr"
    chmod 700 "$fixture_root/source/bin/cr"
    printf 'updated-library\n' > "$fixture_root/source/lib/library"
    printf 'updated-guide\n' > "$fixture_root/source/instructions/guide"

    _run_internal "$fixture_root/source" "$fixture_root/destination" > "$fixture_root/protected.out" || exit 1
    cmp "$fixture_root/source/bin/cr" "$fixture_root/destination/bin/cr" || exit 1
    cmp "$fixture_root/source/lib/library" "$fixture_root/destination/lib/library" || exit 1
    [ "$(cat "$fixture_root/destination/instructions/guide")" = 'local guide edit' ] || exit 1
    grep -Fqx "$guide_record" "$fixture_root/destination/.coderail/install.manifest" || exit 1
    grep -Fqx 'preserved: instructions/guide' "$fixture_root/protected.out" || exit 1

    _run_internal "$fixture_root/source" "$fixture_root/destination" --force --yes >/dev/null || exit 1
    cmp "$fixture_root/source/instructions/guide" "$fixture_root/destination/instructions/guide" || exit 1

    rm "$fixture_root/source/lib/library" "$fixture_root/source/instructions/guide"
    printf 'locally retained guide\n' > "$fixture_root/destination/instructions/guide"
    _run_internal "$fixture_root/source" "$fixture_root/destination" > "$fixture_root/obsolete.out" || exit 1
    [ ! -e "$fixture_root/destination/lib/library" ] || exit 1
    [ "$(cat "$fixture_root/destination/instructions/guide")" = 'locally retained guide' ] || exit 1
    ! grep -Fq "$(printf '\tinstructions/guide\t')" "$fixture_root/destination/.coderail/install.manifest" || exit 1
    grep -Fqx 'removed: lib/library' "$fixture_root/obsolete.out" || exit 1
    grep -Fqx 'preserved: instructions/guide' "$fixture_root/obsolete.out" || exit 1
)

_test_unmanaged_collisions_are_collected_without_mutation()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    _make_source "$fixture_root"
    mkdir -p "$fixture_root/destination/bin" "$fixture_root/destination/instructions"
    cp "$fixture_root/source/bin/cr" "$fixture_root/destination/bin/cr"
    ln -s /not-a-coderail-file "$fixture_root/destination/instructions/guide"
    if _run_internal "$fixture_root/source" "$fixture_root/destination" > "$fixture_root/output" 2>&1; then
        exit 1
    fi
    cmp "$fixture_root/source/bin/cr" "$fixture_root/destination/bin/cr" || exit 1
    [ -L "$fixture_root/destination/instructions/guide" ] || exit 1
    [ ! -e "$fixture_root/destination/.coderail/install.manifest" ] || exit 1
    grep -Fq 'Unmanaged collision: bin/cr' "$fixture_root/output" || exit 1
    grep -Fq 'Unmanaged collision: instructions/guide' "$fixture_root/output" || exit 1
)

_test_invalid_manifest_has_no_authority()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    _make_source "$fixture_root"
    mkdir -p "$fixture_root/destination/bin" "$fixture_root/destination/.coderail"
    printf 'unmanaged program\n' > "$fixture_root/destination/bin/cr"
    printf 'not a manifest\n' > "$fixture_root/destination/.coderail/install.manifest"
    manifest_before=$(cat "$fixture_root/destination/.coderail/install.manifest")
    if _run_internal "$fixture_root/source" "$fixture_root/destination" > "$fixture_root/output" 2>&1; then
        exit 1
    fi
    [ "$(cat "$fixture_root/destination/bin/cr")" = 'unmanaged program' ] || exit 1
    [ "$(cat "$fixture_root/destination/.coderail/install.manifest")" = "$manifest_before" ] || exit 1
    grep -Fq 'Unmanaged collision: bin/cr' "$fixture_root/output" || exit 1
    grep -Fq 'Unmanaged collision: .coderail/install.manifest' "$fixture_root/output" || exit 1
)

_test_strict_manifest_records_are_untrusted()
(
    for manifest_case in duplicate unsafe; do
        (
            fixture_root=$(mktemp -d) || exit 1
            trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
            _make_source "$fixture_root"
            mkdir -p "$fixture_root/destination/bin" "$fixture_root/destination/.coderail"
            cp "$fixture_root/source/bin/cr" "$fixture_root/destination/bin/cr"
            case "$manifest_case" in
                duplicate)
                    printf 'coderail-install-manifest\t1\nfile\tprogram\tbin/cr\t1\t1\nfile\tprogram\tbin/cr\t1\t1\n' \
                        > "$fixture_root/destination/.coderail/install.manifest"
                    ;;
                unsafe)
                    printf 'coderail-install-manifest\t1\nfile\tprogram\t../bin/cr\t1\t1\n' \
                        > "$fixture_root/destination/.coderail/install.manifest"
                    ;;
            esac
            manifest_before=$(cat "$fixture_root/destination/.coderail/install.manifest")
            if _run_internal "$fixture_root/source" "$fixture_root/destination" > "$fixture_root/output" 2>&1; then
                exit 1
            fi
            cmp "$fixture_root/source/bin/cr" "$fixture_root/destination/bin/cr" || exit 1
            [ "$(cat "$fixture_root/destination/.coderail/install.manifest")" = "$manifest_before" ] || exit 1
            grep -Fq 'Unmanaged collision: bin/cr' "$fixture_root/output" || exit 1
            grep -Fq "Unmanaged collision: .coderail/install.manifest" "$fixture_root/output" || exit 1
        ) || exit 1
    done
)

_test_force_choices_and_noninteractive_failure()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    _make_source "$fixture_root"
    mkdir "$fixture_root/destination"
    _run_internal "$fixture_root/source" "$fixture_root/destination" >/dev/null || exit 1
    printf 'local guide edit\n' > "$fixture_root/destination/instructions/guide"
    printf 'next guide\n' > "$fixture_root/source/instructions/guide"
    manifest_before=$(_checksum "$fixture_root/destination/.coderail/install.manifest")

    _run_internal "$fixture_root/source" "$fixture_root/destination" --yes > "$fixture_root/yes.out" || exit 1
    [ "$(cat "$fixture_root/destination/instructions/guide")" = 'local guide edit' ] || exit 1
    grep -Fqx 'preserved: instructions/guide' "$fixture_root/yes.out" || exit 1
    if _run_internal "$fixture_root/source" "$fixture_root/destination" --force > "$fixture_root/force.out" 2>&1; then
        exit 1
    fi
    [ "$(cat "$fixture_root/destination/instructions/guide")" = 'local guide edit' ] || exit 1
    [ "$manifest_before" = "$(_checksum "$fixture_root/destination/.coderail/install.manifest")" ] || exit 1
    grep -Fq 'rerun interactively or with --force --yes' "$fixture_root/force.out" || exit 1

    _run_forced_decline "$fixture_root/source" "$fixture_root/destination" || exit 1
    [ "$(cat "$fixture_root/destination/instructions/guide")" = 'local guide edit' ] || exit 1
    _run_forced_decline "$fixture_root/source" "$fixture_root/destination" || exit 1
    [ "$(cat "$fixture_root/destination/instructions/guide")" = 'local guide edit' ] || exit 1

    _run_internal "$fixture_root/source" "$fixture_root/destination" --force --yes >/dev/null || exit 1
    cmp "$fixture_root/source/instructions/guide" "$fixture_root/destination/instructions/guide" || exit 1
)

_test_rejects_invalid_roots_before_destination_mutation()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    mkdir -p "$fixture_root/source/bin" "$fixture_root/source/lib" "$fixture_root/destination"
    printf '#!/usr/bin/env sh\n' > "$fixture_root/source/real-cr"
    chmod +x "$fixture_root/source/real-cr"
    ln -s ../real-cr "$fixture_root/source/bin/cr"
    printf 'keep\n' > "$fixture_root/destination/marker"
    if _run_internal "$fixture_root/source" "$fixture_root/destination" > "$fixture_root/output" 2>&1; then
        exit 1
    fi
    [ "$(cat "$fixture_root/destination/marker")" = keep ] || exit 1
    if _run_internal "$fixture_root/source" "$fixture_root/source" > "$fixture_root/overlap" 2>&1; then
        exit 1
    fi
    grep -Fq 'must not overlap' "$fixture_root/overlap" || exit 1
)

_test_mixed_protected_replacement_and_preservation()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    tab=$(printf '\t')
    _make_source "$fixture_root"
    mkdir -p "$fixture_root/source/templates" "$fixture_root/destination"
    printf 'source-template\n' > "$fixture_root/source/templates/example"
    _run_internal "$fixture_root/source" "$fixture_root/destination" >/dev/null || exit 1
    template_record=$(grep -F "$(printf 'file\tprotected\ttemplates/example\t')" \
        "$fixture_root/destination/.coderail/install.manifest")

    printf 'local guide edit\n' > "$fixture_root/destination/instructions/guide"
    printf 'local template edit\n' > "$fixture_root/destination/templates/example"
    printf 'next guide\n' > "$fixture_root/source/instructions/guide"
    printf 'next template\n' > "$fixture_root/source/templates/example"

    _run_mixed_confirmations "$fixture_root/source" "$fixture_root/destination" > "$fixture_root/output" || exit 1
    cmp "$fixture_root/source/instructions/guide" "$fixture_root/destination/instructions/guide" || exit 1
    [ "$(cat "$fixture_root/destination/templates/example")" = 'local template edit' ] || exit 1
    grep -Fqx 'updated: instructions/guide' "$fixture_root/output" || exit 1
    grep -Fqx 'preserved: templates/example' "$fixture_root/output" || exit 1
    guide_checksum=$(_checksum "$fixture_root/source/instructions/guide")
    grep -Fqx "file${tab}protected${tab}instructions/guide${tab}${guide_checksum% *}${tab}${guide_checksum#* }" \
        "$fixture_root/destination/.coderail/install.manifest" || exit 1
    grep -Fqx "$template_record" "$fixture_root/destination/.coderail/install.manifest" || exit 1
)

_test_unavailable_confirmation_is_complete_preflight()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    _make_source "$fixture_root"
    mkdir "$fixture_root/destination"
    _run_internal "$fixture_root/source" "$fixture_root/destination" >/dev/null || exit 1
    manifest_before=$(_checksum "$fixture_root/destination/.coderail/install.manifest")
    program_before=$(cat "$fixture_root/destination/bin/cr")
    library_before=$(cat "$fixture_root/destination/lib/library")
    printf 'locally edited guide\n' > "$fixture_root/destination/instructions/guide"
    printf '#!/usr/bin/env sh\nprintf next-program\n' > "$fixture_root/source/bin/cr"
    chmod 700 "$fixture_root/source/bin/cr"
    printf 'next guide\n' > "$fixture_root/source/instructions/guide"
    printf 'next library\n' > "$fixture_root/source/lib/library"

    if _run_unavailable_confirmation "$fixture_root/source" "$fixture_root/destination" \
        > "$fixture_root/output" 2>&1; then
        exit 1
    fi
    [ "$(cat "$fixture_root/destination/bin/cr")" = "$program_before" ] || exit 1
    [ "$(cat "$fixture_root/destination/lib/library")" = "$library_before" ] || exit 1
    [ "$(cat "$fixture_root/destination/instructions/guide")" = 'locally edited guide' ] || exit 1
    [ "$manifest_before" = "$(_checksum "$fixture_root/destination/.coderail/install.manifest")" ] || exit 1
    grep -Fqx 'error: Cannot continue without confirmation; rerun interactively or with --force --yes' \
        "$fixture_root/output" || exit 1
    ! grep -Eq '^(created|updated|removed|unchanged):' "$fixture_root/output" || exit 1
)

_test_late_precondition_failure_stops_remaining_actions()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    tab=$(printf '\t')
    _make_source "$fixture_root"
    mkdir "$fixture_root/destination"
    _run_internal "$fixture_root/source" "$fixture_root/destination" >/dev/null || exit 1
    guide_record=$(grep -F "$(printf 'file\tprotected\tinstructions/guide\t')" \
        "$fixture_root/destination/.coderail/install.manifest")
    library_record=$(grep -F "$(printf 'file\tprogram\tlib/library\t')" \
        "$fixture_root/destination/.coderail/install.manifest")
    printf '#!/usr/bin/env sh\nprintf next-program\n' > "$fixture_root/source/bin/cr"
    chmod 700 "$fixture_root/source/bin/cr"
    printf 'next guide\n' > "$fixture_root/source/instructions/guide"
    printf 'next library\n' > "$fixture_root/source/lib/library"

    if _run_with_late_precondition "$fixture_root/source" "$fixture_root/destination" \
        > "$fixture_root/output" 2>&1; then
        exit 1
    fi
    cmp "$fixture_root/source/bin/cr" "$fixture_root/destination/bin/cr" || exit 1
    [ "$(cat "$fixture_root/destination/instructions/guide")" = 'late local guide edit' ] || exit 1
    [ "$(cat "$fixture_root/destination/lib/library")" = 'source-library' ] || exit 1
    grep -Fqx 'updated: bin/cr' "$fixture_root/output" || exit 1
    grep -Fqx 'error: Failed: instructions/guide' "$fixture_root/output" || exit 1
    grep -Fqx 'not attempted: lib/library' "$fixture_root/output" || exit 1
    grep -Fqx "$guide_record" "$fixture_root/destination/.coderail/install.manifest" || exit 1
    grep -Fqx "$library_record" "$fixture_root/destination/.coderail/install.manifest" || exit 1
    program_checksum=$(_checksum "$fixture_root/source/bin/cr")
    grep -Fqx "file${tab}program${tab}bin/cr${tab}${program_checksum% *}${tab}${program_checksum#* }" \
        "$fixture_root/destination/.coderail/install.manifest" || exit 1
)

_test_copy_failure_stops_remaining_actions()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    tab=$(printf '\t')
    _make_source "$fixture_root"
    mkdir "$fixture_root/destination"
    _run_internal "$fixture_root/source" "$fixture_root/destination" >/dev/null || exit 1
    guide_record=$(grep -F "$(printf 'file\tprotected\tinstructions/guide\t')" \
        "$fixture_root/destination/.coderail/install.manifest")
    library_record=$(grep -F "$(printf 'file\tprogram\tlib/library\t')" \
        "$fixture_root/destination/.coderail/install.manifest")
    printf '#!/usr/bin/env sh\nprintf next-program\n' > "$fixture_root/source/bin/cr"
    chmod 700 "$fixture_root/source/bin/cr"
    printf 'next guide\n' > "$fixture_root/source/instructions/guide"
    printf 'next library\n' > "$fixture_root/source/lib/library"

    if _run_with_copy_failure "$fixture_root/source" "$fixture_root/destination" \
        > "$fixture_root/output" 2>&1; then
        exit 1
    fi
    cmp "$fixture_root/source/bin/cr" "$fixture_root/destination/bin/cr" || exit 1
    [ "$(cat "$fixture_root/destination/instructions/guide")" = 'source-guide' ] || exit 1
    [ "$(cat "$fixture_root/destination/lib/library")" = 'source-library' ] || exit 1
    grep -Fqx 'updated: bin/cr' "$fixture_root/output" || exit 1
    grep -Fqx 'error: Failed: instructions/guide' "$fixture_root/output" || exit 1
    grep -Fqx 'not attempted: lib/library' "$fixture_root/output" || exit 1
    grep -Fqx "$guide_record" "$fixture_root/destination/.coderail/install.manifest" || exit 1
    grep -Fqx "$library_record" "$fixture_root/destination/.coderail/install.manifest" || exit 1
    program_checksum=$(_checksum "$fixture_root/source/bin/cr")
    grep -Fqx "file${tab}program${tab}bin/cr${tab}${program_checksum% *}${tab}${program_checksum#* }" \
        "$fixture_root/destination/.coderail/install.manifest" || exit 1
)

_test_v1_upgrade_backs_up_complete_installation_and_installs_v2()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    _make_source "$fixture_root"
    mkdir -p "$fixture_root/destination/unknown"
    printf 'not a v2 manifest\n' > "$fixture_root/destination/.coderail-install"
    printf 'local modification\n' > "$fixture_root/destination/unknown/modified"
    ln -s unknown/modified "$fixture_root/destination/local-link"

    _run_internal "$fixture_root/source" "$fixture_root/destination" --yes > "$fixture_root/output" || exit 1
    v1_backup=$(find "$fixture_root" -maxdepth 1 -type f -name 'destination-v1-backup.*.tar.gz')
    [ -n "$v1_backup" ] || exit 1
    v1_backup_reported=$(CDPATH= cd -P "$(dirname "$v1_backup")" && pwd)/${v1_backup##*/}
    tar -tzf "$v1_backup" | LC_ALL=C sort > "$fixture_root/archive-list" || exit 1
    printf '%s\n' \
        destination/ \
        destination/.coderail-install \
        destination/local-link \
        destination/unknown/ \
        destination/unknown/modified > "$fixture_root/expected-archive-list"
    cmp "$fixture_root/expected-archive-list" "$fixture_root/archive-list" || exit 1
    [ "$(tar -xOf "$v1_backup" destination/.coderail-install)" = 'not a v2 manifest' ] || exit 1
    [ "$(tar -xOf "$v1_backup" destination/unknown/modified)" = 'local modification' ] || exit 1
    [ -L "$fixture_root/destination/local-link" ] && exit 1
    cmp "$fixture_root/source/bin/cr" "$fixture_root/destination/bin/cr" || exit 1
    [ -f "$fixture_root/destination/.coderail/install.manifest" ] || exit 1
    grep -Fqx "v1 backup: $v1_backup_reported" "$fixture_root/output" || exit 1
)

_test_v1_install_backs_up_complete_installation_and_installs_v2()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    _make_source "$fixture_root"
    mkdir "$fixture_root/destination"
    printf 'legacy marker\n' > "$fixture_root/destination/.coderail-install"
    printf 'local content\n' > "$fixture_root/destination/local-file"

    _run_v1_install "$fixture_root/source" "$fixture_root/destination" > "$fixture_root/output" || exit 1
    v1_backup=$(find "$fixture_root" -maxdepth 1 -type f -name 'destination-v1-backup.*.tar.gz')
    [ -n "$v1_backup" ] || exit 1
    [ "$(tar -xOf "$v1_backup" destination/local-file)" = 'local content' ] || exit 1
    cmp "$fixture_root/source/bin/cr" "$fixture_root/destination/bin/cr" || exit 1
    [ -f "$fixture_root/destination/.coderail/install.manifest" ] || exit 1
)

_test_v1_declined_and_unavailable_confirmations_leave_installation_unchanged()
(
    for confirmation_status in 1 2; do
        (
            fixture_root=$(mktemp -d) || exit 1
            trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
            _make_source "$fixture_root"
            mkdir -p "$fixture_root/destination/unknown"
            printf 'v1 marker contents are ignored\n' > "$fixture_root/destination/.coderail-install"
            printf 'keep me\n' > "$fixture_root/destination/unknown/file"
            if _run_v1_confirmation "$fixture_root/source" "$fixture_root/destination" "$confirmation_status" \
                > "$fixture_root/output" 2>&1; then
                exit 1
            fi
            [ "$(cat "$fixture_root/destination/.coderail-install")" = 'v1 marker contents are ignored' ] || exit 1
            [ "$(cat "$fixture_root/destination/unknown/file")" = 'keep me' ] || exit 1
            [ ! -e "$fixture_root/destination/.coderail/install.manifest" ] || exit 1
            [ -z "$(find "$fixture_root" -maxdepth 1 -type f -name 'destination-v1-backup.*.tar.gz')" ] || exit 1
            if [ "$confirmation_status" -eq 2 ]; then
                grep -Fqx 'error: Cannot continue without confirmation; rerun interactively or with --yes' \
                    "$fixture_root/output" || exit 1
            fi
        ) || exit 1
    done
)

_test_v1_archive_failure_leaves_installation_unchanged()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    _make_source "$fixture_root"
    mkdir "$fixture_root/destination"
    printf 'v1 marker\n' > "$fixture_root/destination/.coderail-install"
    printf 'keep me\n' > "$fixture_root/destination/local-file"
    if _run_v1_archive_failure "$fixture_root/source" "$fixture_root/destination" \
        > "$fixture_root/output" 2>&1; then
        exit 1
    fi
    [ "$(cat "$fixture_root/destination/local-file")" = 'keep me' ] || exit 1
    [ -f "$fixture_root/destination/.coderail-install" ] || exit 1
    [ -z "$(find "$fixture_root" -maxdepth 1 -type f -name 'destination-v1-backup.*.tar.gz')" ] || exit 1
    grep -Fqx 'error: Failed to create v1 backup' "$fixture_root/output" || exit 1
)

_test_v1_replacement_failure_retains_and_reports_backup()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    _make_source "$fixture_root"
    mkdir "$fixture_root/destination"
    printf 'v1 marker\n' > "$fixture_root/destination/.coderail-install"
    printf 'local content\n' > "$fixture_root/destination/local-file"
    if _run_v1_copy_failure "$fixture_root/source" "$fixture_root/destination" \
        > "$fixture_root/output" 2>&1; then
        exit 1
    fi
    v1_backup=$(find "$fixture_root" -maxdepth 1 -type f -name 'destination-v1-backup.*.tar.gz')
    [ -n "$v1_backup" ] || exit 1
    v1_backup_reported=$(CDPATH= cd -P "$(dirname "$v1_backup")" && pwd)/${v1_backup##*/}
    [ "$(tar -xOf "$v1_backup" destination/local-file)" = 'local content' ] || exit 1
    grep -Fqx "v1 backup: $v1_backup_reported" "$fixture_root/output" || exit 1
    grep -Fqx "error: v1 backup retained at $v1_backup_reported" "$fixture_root/output" || exit 1
)

print_tests_header "Internal Installation Tests"

test "fresh install inventories only the payload and makes a deterministic manifest" \
    _test_fresh_install_and_deterministic_manifest
test "program replacement, protected preservation, and obsolete release follow ownership" \
    _test_replacement_protection_and_obsolete_release
test "unmanaged file and link collisions are all reported before mutation" \
    _test_unmanaged_collisions_are_collected_without_mutation
test "invalid manifests are not trusted as installation authority" _test_invalid_manifest_has_no_authority
test "duplicate and unsafe manifest records are rejected without partial trust" \
    _test_strict_manifest_records_are_untrusted
test "force, yes, and noninteractive protected-file choices are distinct" _test_force_choices_and_noninteractive_failure
test "invalid source and overlapping roots leave the destination untouched" \
    _test_rejects_invalid_roots_before_destination_mutation
test "mixed protected overwrite confirmations replace and preserve independently" \
    _test_mixed_protected_replacement_and_preservation
test "unavailable protected-file confirmation fails before all mutations" \
    _test_unavailable_confirmation_is_complete_preflight
test "late protected-file precondition failure stops later actions" \
    _test_late_precondition_failure_stops_remaining_actions
test "copy failure stops later actions after completed manifest snapshots" \
    _test_copy_failure_stops_remaining_actions
test "v1 upgrades back up the complete installation before installing v2" \
    _test_v1_upgrade_backs_up_complete_installation_and_installs_v2
test "bootstrap installation backs up and replaces v1 installations" \
    _test_v1_install_backs_up_complete_installation_and_installs_v2
test "v1 declined and unavailable confirmations leave the installation unchanged" \
    _test_v1_declined_and_unavailable_confirmations_leave_installation_unchanged
test "v1 archive failure leaves the installation unchanged" \
    _test_v1_archive_failure_leaves_installation_unchanged
test "v1 replacement failure retains and reports the completed backup" \
    _test_v1_replacement_failure_retains_and_reports_backup

print_tests_summary

if some_tests_failed; then
    exit 1
fi

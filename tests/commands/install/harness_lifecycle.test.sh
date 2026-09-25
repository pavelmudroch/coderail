#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"
. "$PROJECT_ROOT/lib/utils/path.sh"
. "$PROJECT_ROOT/lib/commands/install/harness_lifecycle.sh"

log_error()
{
    :
}

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' 0 HUP INT TERM

_expect_failure()
{
    if "$@" >/dev/null 2>&1; then
        return 1
    fi
    return 0
}

_read_valid_manifest()
{
    harness_manifest_read "$test_dir/home" codex "$test_dir/records"
    cat "$test_dir/records"
}

_read_rejected_manifest()
{
    _expect_failure harness_manifest_read "$test_dir/home" codex "$test_dir/records"
}

_stage_link_failure_preserves_home()
{
    rm -rf "$test_dir/home/.coderail"
    mkdir "$test_dir/stage-work" || return 1
    harness_render()
    {
        ln -s nowhere "$3/AGENTS.md"
    }
    _expect_failure harness_install_prepare codex "$test_dir/home" "$test_dir/bundle" \
        "$test_dir/stage-work" || return 1
    [ ! -e "$test_dir/home/AGENTS.md" ] && \
        [ ! -e "$test_dir/home/.coderail/harnesses/codex.manifest" ]
}

_install_rendered()
{
    _install_rendered_payload=$1
    _install_rendered_force=$2
    _install_rendered_yes=$3
    _install_rendered_work=$(mktemp -d "$test_dir/work.XXXXXX") || return 1
    harness_render()
    {
        mkdir -p "$3/skills/build" || return 1
        printf '%s' "$_install_rendered_payload" | sed '1s/|.*//' > "$3/AGENTS.md" || return 1
        case "$_install_rendered_payload" in
            *'|'*) printf '%s' "${_install_rendered_payload#*|}" > "$3/skills/build/SKILL.md" ;;
        esac
    }
    harness_install_prepare codex "$test_dir/home" "$test_dir/bundle" "$_install_rendered_work" \
        "$_install_rendered_force" "$_install_rendered_yes" || return 1
    harness_install_apply "$_install_rendered_work"
}

_manifest_has_only_agents()
{
    harness_manifest_read "$test_dir/home" codex "$test_dir/records" || return 1
    [ "$(wc -l < "$test_dir/records")" -eq 1 ] && grep -Fq 'AGENTS.md' "$test_dir/records"
}

_refresh_owned_file()
{
    rm -rf "$test_dir/home/.coderail" "$test_dir/home/AGENTS.md"
    _install_rendered 'old' 0 0 || return 1
    _install_rendered 'new' 0 0 || return 1
    [ "$(cat "$test_dir/home/AGENTS.md")" = new ] && _manifest_has_only_agents
}

_edited_file_equal_to_staged_bytes_refreshes()
{
    rm -rf "$test_dir/home/.coderail" "$test_dir/home/AGENTS.md"
    _install_rendered 'old' 0 0 || return 1
    printf new > "$test_dir/home/AGENTS.md"
    _install_rendered 'new' 0 0 || return 1
    _manifest_has_only_agents
}

_missing_owned_file_is_recreated()
{
    rm -rf "$test_dir/home/.coderail" "$test_dir/home/AGENTS.md"
    _install_rendered old 0 0 || return 1
    rm "$test_dir/home/AGENTS.md"
    _install_rendered new 0 0 || return 1
    [ "$(cat "$test_dir/home/AGENTS.md")" = new ]
}

_mode_change_does_not_mark_an_edit()
{
    rm -rf "$test_dir/home/.coderail" "$test_dir/home/AGENTS.md"
    _install_rendered old 0 0 || return 1
    chmod 700 "$test_dir/home/AGENTS.md"
    _install_rendered old 0 0 || return 1
    [ -x "$test_dir/home/AGENTS.md" ]
}

_obsolete_file_is_removed_or_released()
{
    rm -rf "$test_dir/home/.coderail" "$test_dir/home/AGENTS.md" "$test_dir/home/skills"
    _install_rendered 'old|skill' 0 0 || return 1
    _install_rendered new 0 0 || return 1
    [ ! -e "$test_dir/home/skills/build/SKILL.md" ] || return 1
    _manifest_has_only_agents || return 1
    _install_rendered 'new|replacement' 0 0 || return 1
    printf personal > "$test_dir/home/skills/build/SKILL.md"
    _install_rendered new 0 0 || return 1
    [ "$(cat "$test_dir/home/skills/build/SKILL.md")" = personal ] || return 1
    _manifest_has_only_agents || return 1
    _expect_failure _install_rendered 'new|replacement' 0 0
}

_force_confirmation_preflight()
{
    rm -rf "$test_dir/home/.coderail" "$test_dir/home/AGENTS.md"
    _install_rendered old 0 0 || return 1
    printf personal > "$test_dir/home/AGENTS.md"
    _install_rendered new 0 0 || return 1
    [ "$(cat "$test_dir/home/AGENTS.md")" = personal ] || return 1
    log_confirm() { return 1; }
    _install_rendered new 1 0 || return 1
    [ "$(cat "$test_dir/home/AGENTS.md")" = personal ] || return 1
    log_confirm() { return 2; }
    _expect_failure _install_rendered new 1 0 || return 1
    [ "$(cat "$test_dir/home/AGENTS.md")" = personal ] || return 1
    log_confirm() { return 0; }
    _install_rendered new 1 0 || return 1
    [ "$(cat "$test_dir/home/AGENTS.md")" = new ]
}

_manifest_publication_failure_reports_partial_state()
{
    rm -rf "$test_dir/home/.coderail" "$test_dir/home/AGENTS.md" "$test_dir/home/skills"
    : > "$test_dir/report" || return 1
    output()
    {
        printf '%s\n' "$1" >> "$test_dir/report"
    }
    _manifest_moves=0
    mv()
    {
        _manifest_move_target=
        for _manifest_move_argument; do
            _manifest_move_target=$_manifest_move_argument
        done
        case "$_manifest_move_target" in
            */codex.manifest)
                _manifest_moves=$((_manifest_moves + 1))
                [ "$_manifest_moves" -eq 2 ] && return 1
                ;;
        esac
        command mv "$@"
    }
    _expect_failure _install_rendered 'one|two' 0 0 || return 1
    unset -f mv
    [ "$(cat "$test_dir/home/AGENTS.md")" = one ] && \
        [ "$(cat "$test_dir/home/skills/build/SKILL.md")" = two ] || return 1
    harness_manifest_read "$test_dir/home" codex "$test_dir/records" || return 1
    [ "$(cat "$test_dir/records")" = "AGENTS.md$(printf '\t')$(path_checksum "$test_dir/home/AGENTS.md" | sed 's/ /\t/')" ] || return 1
    grep -Fqx 'create: AGENTS.md' "$test_dir/report" && \
        grep -Fqx 'failed: skills/build/SKILL.md changed, but its manifest snapshot was not published' "$test_dir/report" && \
        _expect_failure _install_rendered 'one|two' 0 0
}

_uninstall_prepare_apply()
{
    _uninstall_force=$1
    _uninstall_yes=$2
    _uninstall_work=$(mktemp -d "$test_dir/uninstall.XXXXXX") || return 1
    harness_uninstall_prepare codex "$test_dir/home" "$_uninstall_work" \
        "$_uninstall_force" "$_uninstall_yes" || return 1
    harness_uninstall_apply "$_uninstall_work"
}

_uninstall_manifest_for_agents()
{
    _uninstall_payload=$1
    rm -rf "$test_dir/home/.coderail" "$test_dir/home/AGENTS.md"
    printf '%s' "$_uninstall_payload" > "$test_dir/home/AGENTS.md" || return 1
    _uninstall_checksum=$(path_checksum "$test_dir/home/AGENTS.md") || return 1
    printf 'AGENTS.md\t%s\t%s\n' "${_uninstall_checksum% *}" "${_uninstall_checksum#* }" > "$test_dir/input" || return 1
    harness_manifest_write "$test_dir/home" codex "$test_dir/input"
}

_uninstall_absent_manifest_is_noop()
{
    rm -rf "$test_dir/home/.coderail"
    mkdir "$test_dir/uninstall-absent" || return 1
    harness_uninstall_prepare codex "$test_dir/home" "$test_dir/uninstall-absent" 0 0 || return 1
    harness_uninstall_apply "$test_dir/uninstall-absent" && [ ! -e "$test_dir/home/.coderail" ]
}

_uninstall_empty_manifest()
{
    rm -rf "$test_dir/home/.coderail"
    mkdir -p "$test_dir/home/.coderail/harnesses" || return 1
    printf 'coderail-harness-manifest\t1\tcodex\n' > "$test_dir/home/.coderail/harnesses/codex.manifest" || return 1
    mkdir "$test_dir/uninstall-empty" || return 1
    harness_uninstall_prepare codex "$test_dir/home" "$test_dir/uninstall-empty" 0 0 || return 1
    harness_uninstall_apply "$test_dir/uninstall-empty" && \
        [ ! -e "$test_dir/home/.coderail/harnesses/codex.manifest" ]
}

_uninstall_unchanged_file()
{
    _uninstall_manifest_for_agents installed || return 1
    _uninstall_prepare_apply 0 0 || return 1
    [ ! -e "$test_dir/home/AGENTS.md" ] && [ ! -e "$test_dir/home/.coderail/harnesses/codex.manifest" ]
}

_uninstall_absent_file_releases_record()
{
    _uninstall_manifest_for_agents installed || return 1
    rm "$test_dir/home/AGENTS.md" || return 1
    _uninstall_prepare_apply 0 0 || return 1
    [ ! -e "$test_dir/home/.coderail/harnesses/codex.manifest" ]
}

_uninstall_preserves_edit_and_user_files()
{
    _uninstall_manifest_for_agents installed || return 1
    printf personal > "$test_dir/home/AGENTS.md" || return 1
    mkdir -p "$test_dir/home/skills/build" || return 1
    printf personal > "$test_dir/home/skills/build/SKILL.md" || return 1
    _uninstall_prepare_apply 0 0 || return 1
    [ "$(cat "$test_dir/home/AGENTS.md")" = personal ] && \
        [ -f "$test_dir/home/skills/build/SKILL.md" ] && \
        [ ! -e "$test_dir/home/.coderail/harnesses/codex.manifest" ]
}

_uninstall_link_decisions()
{
    _uninstall_manifest_for_agents installed || return 1
    rm "$test_dir/home/AGENTS.md" || return 1
    ln -s elsewhere "$test_dir/home/AGENTS.md" || return 1
    log_confirm() { return 1; }
    _uninstall_prepare_apply 1 0 || return 1
    [ -L "$test_dir/home/AGENTS.md" ] || return 1
    _uninstall_manifest_for_agents installed || return 1
    rm "$test_dir/home/AGENTS.md" || return 1
    ln -s elsewhere "$test_dir/home/AGENTS.md" || return 1
    _uninstall_prepare_apply 1 1 || return 1
    [ ! -e "$test_dir/home/AGENTS.md" ] && [ ! -L "$test_dir/home/AGENTS.md" ]
}

_uninstall_confirmation_unavailable_has_no_mutation()
{
    _uninstall_manifest_for_agents installed || return 1
    printf personal > "$test_dir/home/AGENTS.md" || return 1
    log_confirm() { return 2; }
    _expect_failure _uninstall_prepare_apply 1 0 || return 1
    [ "$(cat "$test_dir/home/AGENTS.md")" = personal ] && \
        [ -f "$test_dir/home/.coderail/harnesses/codex.manifest" ]
}

_uninstall_rejects_unsafe_metadata()
{
    _uninstall_manifest_for_agents installed || return 1
    rm -rf "$test_dir/home/.coderail" || return 1
    ln -s "$test_dir/input" "$test_dir/home/.coderail" || return 1
    mkdir "$test_dir/uninstall-unsafe" || return 1
    _expect_failure harness_uninstall_prepare codex "$test_dir/home" "$test_dir/uninstall-unsafe" 0 0 && \
        [ "$(cat "$test_dir/home/AGENTS.md")" = installed ]
}

_global_claim_conflicts_are_rejected()
{
    mkdir "$test_dir/global-one" "$test_dir/global-two" || return 1
    printf 'codex\n%s\n' "$test_dir/home" > "$test_dir/global-one/plan" || return 1
    printf 'claude\n%s\n' "$test_dir/home" > "$test_dir/global-two/plan" || return 1
    printf 'shared\t1\t1\n' > "$test_dir/global-one/records" || return 1
    printf 'shared/child\t1\t1\n' > "$test_dir/global-two/records" || return 1
    _expect_failure harness_plans_validate "$test_dir/global-one" "$test_dir/global-two"
}

_global_separate_metadata_is_valid()
{
    mkdir "$test_dir/global-safe-one" "$test_dir/global-safe-two" || return 1
    printf 'codex\n%s\n' "$test_dir/home" > "$test_dir/global-safe-one/plan" || return 1
    printf 'claude\n%s\n' "$test_dir/home" > "$test_dir/global-safe-two/plan" || return 1
    printf 'AGENTS.md\t1\t1\n' > "$test_dir/global-safe-one/records" || return 1
    printf 'CLAUDE.md\t1\t1\n' > "$test_dir/global-safe-two/records" || return 1
    harness_plans_validate "$test_dir/global-safe-one" "$test_dir/global-safe-two"
}

print_tests_header "Harness Lifecycle Manifest Tests"

mkdir "$test_dir/home"
printf 'skills/build/SKILL.md\t3\t4\nAGENTS.md\t1\t2\n' > "$test_dir/input"
test "manifest: writes and reads sorted snapshot" harness_manifest_write "$test_dir/home" codex "$test_dir/input"
test_expect "manifest: sorted records" "AGENTS.md	1	2
skills/build/SKILL.md	3	4" _read_valid_manifest

for malformed in \
    'coderail-harness-manifest\t1\tclaude\n' \
    'coderail-harness-manifest\t2\tcodex\n' \
    'coderail-harness-manifest\t1\tcodex\nAGENTS.md\t1\t2' \
    'coderail-harness-manifest\t1\tcodex\nAGENTS.md\t1\t2\textra\n' \
    'coderail-harness-manifest\t1\tcodex\nAGENTS.md\tone\t2\n' \
    'coderail-harness-manifest\t1\tcodex\nskills/build/SKILL.md\t1\t2\nAGENTS.md\t1\t2\n' \
    'coderail-harness-manifest\t1\tcodex\nAGENTS.md\t1\t2\nAGENTS.md\t3\t4\n' \
    'coderail-harness-manifest\t1\tcodex\n.coderail/harnesses/codex.manifest\t1\t2\n'; do
    rm -rf "$test_dir/home/.coderail"
    printf '%b' "$malformed" > "$test_dir/home/.manifest"
    mkdir -p "$test_dir/home/.coderail/harnesses"
    mv "$test_dir/home/.manifest" "$test_dir/home/.coderail/harnesses/codex.manifest"
    test "manifest: rejects malformed record" _read_rejected_manifest
done

rm -rf "$test_dir/home/.coderail"
ln -s "$test_dir/input" "$test_dir/home/.coderail"
test "manifest: rejects linked metadata" _read_rejected_manifest
rm "$test_dir/home/.coderail"
mkdir -p "$test_dir/home/.coderail/harnesses"
ln -s "$test_dir/input" "$test_dir/home/.coderail/harnesses/codex.manifest"
test "manifest: rejects linked manifest" _read_rejected_manifest
rm -rf "$test_dir/home/.coderail"
printf 'metadata\n' > "$test_dir/home/.coderail"
test "manifest: refuses nonmanifest metadata" _expect_failure harness_manifest_write "$test_dir/home" codex "$test_dir/input"
rm "$test_dir/home/.coderail"
mkdir -p "$test_dir/home/.coderail/harnesses/codex.manifest"
test "manifest: rejects wrong-type manifest" _read_rejected_manifest
test "install preparation: rejects linked stage entries without home changes" \
    _stage_link_failure_preserves_home
test "install: refreshes unchanged owned files" _refresh_owned_file
test "install: accepts edited bytes equal to staged bytes" _edited_file_equal_to_staged_bytes_refreshes
test "install: recreates a missing owned file" _missing_owned_file_is_recreated
test "install: does not treat a mode change as an edit" _mode_change_does_not_mark_an_edit
test "install: removes obsolete files and releases preserved ownership" _obsolete_file_is_removed_or_released
test "install: confirmation failure has no mutation" _force_confirmation_preflight
test "install: reports a changed file whose manifest publication failed" \
    _manifest_publication_failure_reports_partial_state
test "global plans: rejects payload file-parent conflicts" _global_claim_conflicts_are_rejected
test "global plans: permits separate manifests in one home" _global_separate_metadata_is_valid
test "uninstall: absent manifest is a no-op" _uninstall_absent_manifest_is_noop
test "uninstall: empty manifest is removed" _uninstall_empty_manifest
test "uninstall: removes unchanged managed file" _uninstall_unchanged_file
test "uninstall: releases absent managed file" _uninstall_absent_file_releases_record
test "uninstall: preserves edits and unrelated files" _uninstall_preserves_edit_and_user_files
test "uninstall: protects links unless approved" _uninstall_link_decisions
test "uninstall: unavailable confirmation has no mutation" _uninstall_confirmation_unavailable_has_no_mutation
test "uninstall: rejects unsafe metadata" _uninstall_rejects_unsafe_metadata

print_tests_summary

if some_tests_failed; then
    exit 1
fi

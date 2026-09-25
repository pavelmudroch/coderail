#!/usr/bin/env sh

usage()
{
    cat <<'EOF'
Usage:
  cr uninstall [options] [<harness> ...]

  Uninstall instruction set for the specified harnesses, or coderail itself

Options:
  -h, --help            Show this help message and exit
  -f, --force           Force uninstallation, removing user edited files,
                        prompts for confirmation
  -y, --yes             Automatically confirm the prompt
      --self            Uninstall coderail itself, cannot be combined with
                        harness

Arguments:
  <harness>             One or more harnesses to uninstall instruction sets for,
                        currently supported harnesses are:
                        codex | claude | copilot | gemini
EOF
}

execute_command()
{
    uninstall_force=0
    uninstall_yes=0
    uninstall_names=
    while [ "$#" -gt 0 ]; do
        case "$1" in
            -h|--help) usage; exit "$_CR_SUCCESS_EXIT_CODE" ;;
            --help=*) log_error "--help does not take an argument"; usage >&2; exit "$_CR_USAGE_EXIT_CODE" ;;
            -f|--force) uninstall_force=1 ;;
            -y|--yes) uninstall_yes=1 ;;
            --self) log_error "--self is reserved for Coderail program removal"; usage >&2; exit "$_CR_USAGE_EXIT_CODE" ;;
            --) shift; break ;;
            -*) log_error "Unknown option: $1"; usage >&2; exit "$_CR_USAGE_EXIT_CODE" ;;
            *) break ;;
        esac
        shift
    done
    while [ "$#" -gt 0 ]; do
        _is_supported_harness "$1" || { log_error "Unsupported harness: $1"; usage >&2; exit "$_CR_USAGE_EXIT_CODE"; }
        case " $uninstall_names " in *" $1 "*) ;; *) uninstall_names="$uninstall_names $1" ;; esac
        shift
    done
    [ -n "$uninstall_names" ] || { log_error "At least one harness is required"; usage >&2; exit "$_CR_USAGE_EXIT_CODE"; }

    . "$_CR_INSTALL_DIR/lib/commands/install/harness_lifecycle.sh"
    uninstall_work=$(fs_create_temp_dir) || { log_error "Failed to create uninstallation workspace"; exit "$_CR_ERROR_EXIT_CODE"; }
    uninstall_index=0
    for uninstall_harness in $uninstall_names; do
        case "$uninstall_harness" in
            codex) uninstall_home=$codex_home ;;
            claude) uninstall_home=$claude_home ;;
            copilot) uninstall_home=$copilot_home ;;
            gemini) uninstall_home=$gemini_home ;;
        esac
        uninstall_plan=$uninstall_work/$uninstall_index
        mkdir "$uninstall_plan" || { log_error "Failed to prepare $uninstall_harness uninstallation"; exit "$_CR_ERROR_EXIT_CODE"; }
        if ! harness_uninstall_prepare "$uninstall_harness" "$uninstall_home" "$uninstall_plan" \
            "$uninstall_force" "$uninstall_yes"; then
            log_error "Failed to prepare $uninstall_harness uninstallation"
            exit "$_CR_ERROR_EXIT_CODE"
        fi
        uninstall_index=$((uninstall_index + 1))
    done
    uninstall_plans=
    uninstall_index=0
    for uninstall_harness in $uninstall_names; do
        uninstall_plans="$uninstall_plans $uninstall_work/$uninstall_index"
        uninstall_index=$((uninstall_index + 1))
    done
    if ! harness_plans_validate $uninstall_plans; then
        log_error "Selected harness uninstallations conflict"
        exit "$_CR_ERROR_EXIT_CODE"
    fi
    uninstall_index=0
    for uninstall_harness in $uninstall_names; do
        uninstall_plan=$uninstall_work/$uninstall_index
        if [ "$(sed -n '1p' "$uninstall_plan/plan")" = absent ]; then
            output "No managed installation found for $uninstall_harness."
        elif ! harness_uninstall_apply "$uninstall_plan"; then
            log_error "Failed to uninstall $uninstall_harness"
            exit "$_CR_ERROR_EXIT_CODE"
        else
            while IFS="$_harness_manifest_tab" read -r uninstall_action uninstall_relative \
                uninstall_sum uninstall_length uninstall_state; do
                [ "$uninstall_action" = release ] && output "Preserved edited $uninstall_relative."
            done < "$uninstall_plan/actions"
            output "Uninstalled instruction set for $uninstall_harness."
        fi
        uninstall_index=$((uninstall_index + 1))
    done
}

#!/usr/bin/env sh

usage()
{
    cat <<'EOF'
Usage:
  cr install [options] [<harness> ...]

  Install instruction set for the specified harnesses

Options:
  -h, --help            Show this help message and exit
  -f, --force           Force installation, overwriting user edited files,
                        prompts for confirmation
  -y, --yes             Automatically confirm the prompt

Arguments:
  <harness>             One or more harnesses to install instruction sets for,
                        currently supported harnesses are:
                        codex | claude | copilot | gemini
EOF
}

execute_command()
{
    install_force=0
    install_yes=0
    install_names=
    while [ "$#" -gt 0 ]; do
        case "$1" in
            -h|--help) usage; exit "$_CR_SUCCESS_EXIT_CODE" ;;
            --help=*) log_error "--help does not take an argument"; usage >&2; exit "$_CR_USAGE_EXIT_CODE" ;;
            -f|--force) install_force=1 ;;
            -y|--yes) install_yes=1 ;;
            --) shift; break ;;
            -*) log_error "Unknown option: $1"; usage >&2; exit "$_CR_USAGE_EXIT_CODE" ;;
            *) break ;;
        esac
        shift
    done
    while [ "$#" -gt 0 ]; do
        _is_supported_harness "$1" || { log_error "Unsupported harness: $1"; usage >&2; exit "$_CR_USAGE_EXIT_CODE"; }
        case " $install_names " in *" $1 "*) ;; *) install_names="$install_names $1" ;; esac
        shift
    done
    [ -n "$install_names" ] || { log_error "At least one harness is required"; usage >&2; exit "$_CR_USAGE_EXIT_CODE"; }

    . "$_CR_INSTALL_DIR/lib/commands/install/harness_lifecycle.sh"
    . "$_CR_INSTALL_DIR/lib/commands/install/render.sh"
    install_work=$(fs_create_temp_dir) || { log_error "Failed to create installation workspace"; exit "$_CR_ERROR_EXIT_CODE"; }
    install_index=0
    for install_harness in $install_names; do
        case "$install_harness" in
            codex) install_home=$codex_home ;;
            claude) install_home=$claude_home ;;
            copilot) install_home=$copilot_home ;;
            gemini) install_home=$gemini_home ;;
        esac
        install_plan=$install_work/$install_index
        mkdir "$install_plan" || { log_error "Failed to prepare $install_harness installation"; exit "$_CR_ERROR_EXIT_CODE"; }
        if ! harness_install_prepare "$install_harness" "$install_home" "$_CR_INSTALL_DIR" "$install_plan" \
            "$install_force" "$install_yes"; then
            log_error "Failed to prepare $install_harness installation"
            exit "$_CR_ERROR_EXIT_CODE"
        fi
        install_index=$((install_index + 1))
    done
    install_plans=
    install_index=0
    for install_harness in $install_names; do
        install_plans="$install_plans $install_work/$install_index"
        install_index=$((install_index + 1))
    done
    if ! harness_plans_validate $install_plans; then
        log_error "Selected harness installations conflict"
        exit "$_CR_ERROR_EXIT_CODE"
    fi
    install_index=0
    for install_harness in $install_names; do
        if ! harness_install_apply "$install_work/$install_index"; then
            log_error "Failed to install $install_harness"
            exit "$_CR_ERROR_EXIT_CODE"
        fi
        output "Installed instruction set for $install_harness."
        install_index=$((install_index + 1))
    done
}

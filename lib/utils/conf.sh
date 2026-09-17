#!/usr/bin/env sh

argc=0
argv_0=""
: ${cwd:=$(pwd)}

load_config()
{
    [ -z "${LOG_LEVEL:-}" ] || case "$LOG_LEVEL" in
        verbose)
            log_level=2
            ;;
        quiet)
            log_level=0
            ;;
    esac
    [ -z "${NO_COLOR:-}" ] || log_color=0
    [ -z "${NON_INTERACTIVE:-}" ] || log_interactive=0
    reinit_log

    while [ $# -gt 0 ]; do
        case "$1" in
            --cwd)
                shift
                [ -z "$1" ] || case "$1" in
                    -*)
                        log_error "--cwd requires a directory argument"
                        usage >&2
                        exit "$USAGE_EXIT_CODE"
                        ;;
                esac
                cwd="$1"
                ;;
            --cwd=*)
                cwd="${1#*=}"
                ;;
            --no-color)
                log_color=0
                reinit_log
                ;;
            --no-color=*)
                log_error "--no-color does not take an argument"
                usage >&2
                exit "$USAGE_EXIT_CODE"
                ;;
            --non-interactive)
                log_interactive=0
                reinit_log
                ;;
            --non-interactive=*)
                log_error "--non-interactive does not take an argument"
                usage >&2
                exit "$USAGE_EXIT_CODE"
                ;;
            --verbose)
                log_level=2
                reinit_log
                ;;
            --verbose=*)
                log_error "--verbose does not take an argument"
                usage >&2
                exit "$USAGE_EXIT_CODE"
                ;;
            --quiet)
                log_level=0
                reinit_log
                ;;
            --quiet=*)
                log_error "--quiet does not take an argument"
                usage >&2
                exit "$USAGE_EXIT_CODE"
                ;;
            -[a-zA-Z]*)
                _parse_short_options "$1"
                ;;
            --)
                shift
                break
                ;;
            *)
                eval "argv_$argc=\$1"
                argc=$(($argc + 1))
                ;;
        esac
        shift
    done

    # collect remaining arguments if -- present
    while [ $# -gt 0 ]; do
        eval "argv_$argc=\$1"
        argc=$(($argc + 1))
        shift
    done

    default_harness=""
    test_shell=""
    codex_command="codex"
    codex_home="$HOME/.codex"
    claude_command="claude"
    claude_home="$HOME/.claude"
    copilot_command="copilot"
    copilot_home="$HOME/.copilot"
    gemini_command="gemini"
    gemini_home="$HOME/.gemini"

    global_config_file="$_CR_INSTALL_DIR/.coderail/coderail.conf"
    _parse_config_file "$global_config_file"
    reinit_log

    local_config_file="$(pwd)/.coderail/coderail.conf"
    _parse_config_file "$local_config_file"
    reinit_log

    if [ -n "${DEFAULT_HARNESS:-}" ]; then
        if ! _is_supported_harness "$DEFAULT_HARNESS"; then
            log_error "Unsupported default harness in env variable DEFAULT_HARNESS: \"$DEFAULT_HARNESS\""
            exit "$_CR_ERROR_EXIT_CODE"
        fi
        default_harness="$DEFAULT_HARNESS"
    fi

    if [ -n "${TEST_SHELL:-}" ]; then
        if ! command -v "$TEST_SHELL" >/dev/null 2>&1; then
            log_error "Unrecognized test shell in env variable TEST_SHELL: \"$TEST_SHELL\""
            exit "$_CR_ERROR_EXIT_CODE"
        fi
        test_shell="$TEST_SHELL"
    fi

    if [ -z "$test_shell" ]; then
        test_shell="sh"

        if [ -n "$SHELL" ]; then
            if ! command -v "$SHELL" >/dev/null 2>&1; then
                log_warn "Unrecognized SHELL environment variable: \"$SHELL\": falling back to default test shell \"$test_shell\""
            else
                test_shell="$SHELL"
            fi
        fi
    fi

    if [ -n "${CODEX_HOME:-}" ]; then
        [ -d "$CODEX_HOME" ] || {
            log_error "Invalid codex home directory in env variable CODEX_HOME: \"$CODEX_HOME\""
            exit "$_CR_ERROR_EXIT_CODE"
        }
        codex_home="$CODEX_HOME"
    fi

    if [ -n "${CLAUDE_HOME:-}" ]; then
        [ -d "$CLAUDE_HOME" ] || {
            log_error "Invalid claude home directory in env variable CLAUDE_HOME: \"$CLAUDE_HOME\""
            exit "$_CR_ERROR_EXIT_CODE"
        }
        claude_home="$CLAUDE_HOME"
    fi

    if [ -n "${COPILOT_HOME:-}" ]; then
        [ -d "$COPILOT_HOME" ] || {
            log_error "Invalid copilot home directory in env variable COPILOT_HOME: \"$COPILOT_HOME\""
            exit "$_CR_ERROR_EXIT_CODE"
        }
        copilot_home="$COPILOT_HOME"
    fi

    if [ -n "${GEMINI_HOME:-}" ]; then
        [ -d "$GEMINI_HOME" ] || {
            log_error "Invalid gemini home directory in env variable GEMINI_HOME: \"$GEMINI_HOME\""
            exit "$_CR_ERROR_EXIT_CODE"
        }
        gemini_home="$GEMINI_HOME"
    fi

    if [ -n "${CODEX_COMMAND:-}" ]; then
        if ! codex_command="$(command -v "$CODEX_COMMAND")"; then
            log_error "Unrecognized codex command in env variable CODEX_COMMAND: \"$CODEX_COMMAND\""
            exit "$_CR_ERROR_EXIT_CODE"
        fi
    fi

    if [ -n "${CLAUDE_COMMAND:-}" ]; then
        if ! claude_command="$(command -v "$CLAUDE_COMMAND")"; then
            log_error "Unrecognized claude command in env variable CLAUDE_COMMAND: \"$CLAUDE_COMMAND\""
            exit "$_CR_ERROR_EXIT_CODE"
        fi
    fi

    if [ -n "${COPILOT_COMMAND:-}" ]; then
        if ! copilot_command="$(command -v "$COPILOT_COMMAND")"; then
            log_error "Unrecognized copilot command in env variable COPILOT_COMMAND: \"$COPILOT_COMMAND\""
            exit "$_CR_ERROR_EXIT_CODE"
        fi
    fi

    if [ -n "${GEMINI_COMMAND:-}" ]; then
        if ! gemini_command="$(command -v "$GEMINI_COMMAND")"; then
            log_error "Unrecognized gemini command in env variable GEMINI_COMMAND: \"$GEMINI_COMMAND\""
            exit "$_CR_ERROR_EXIT_CODE"
        fi
    fi
}

_parse_config_file()
{
    config_file="$1"
    log_verbose "Loading configuration file: \"$config_file\""
    [ -f "$config_file" ] || return 0

    current_line=0
    while IFS= read -r line || [ -n "$line" ]; do
        current_line=$((current_line + 1))

        # Skip blank lines.
        case "$line" in
            *[![:space:]]*) ;;
            *) continue ;;
        esac

        # Trim leading whitespace from line.
        line=${line#"${line%%[![:space:]]*}"}

        # Skip comment lines.
        case "$line" in
            \#*) continue ;;
        esac

        # Require key=value.
        case "$line" in
            *=*) ;;
            *)
                # log_error "Invalid config line: $(line)\n"
                message=$(printf "Invalid configuration file \"%s\" at line %d: \"%s\"\nExpected format: key=value" "$config_file" "$current_line" "$line")
                log_error "$message"
                exit "$_CR_ERROR_EXIT_CODE"
                ;;
        esac

        key=${line%%=*}
        value=${line#*=}

        # Trim trailing whitespace from key.
        key=${key%"${key##*[![:space:]]}"}

        # Trim leading whitespace from value.
        value=${value#"${value%%[![:space:]]*}"}

        # Trim trailing whitespace from value.
        value=${value%"${value##*[![:space:]]}"}

        case "$key" in
            "default_harness")
                if ! _is_supported_harness "$value"; then
                    message=$(printf "Unsupported harness \"%s\" in file \"%s\" at line %d" "$value" "$config_file" "$current_line")
                    log_error "$message"
                    exit "$_CR_ERROR_EXIT_CODE"
                fi
                default_harness="$value"
                ;;
            "test_shell")
                if ! command -v "$value" >/dev/null 2>&1; then
                    message=$(printf "Unrecognized test shell \"%s\" in file \"%s\" at line %d" "$value" "$config_file" "$current_line")
                    log_error "$message"
                    exit "$_CR_ERROR_EXIT_CODE"
                fi
                test_shell="$value"
                ;;
            "codex_command")
                codex_command="$(command -v "$value")" || {
                    message=$(printf "Failed to locate codex executable in file \"%s\" at line %d" "$config_file" "$current_line")
                    log_error "$message"
                    exit "$_CR_ERROR_EXIT_CODE"
                }
                ;;
            "claude_command")
                claude_command="$(command -v "$value")" || {
                    message=$(printf "Failed to locate claude executable in file \"%s\" at line %d" "$config_file" "$current_line")
                    log_error "$message"
                    exit "$_CR_ERROR_EXIT_CODE"
                }
                ;;
            "copilot_command")
                copilot_command="$(command -v "$value")" || {
                    message=$(printf "Failed to locate copilot executable in file \"%s\" at line %d" "$config_file" "$current_line")
                    log_error "$message"
                    exit "$_CR_ERROR_EXIT_CODE"
                }
                ;;
            "gemini_command")
                gemini_command="$(command -v "$value")" || {
                    message=$(printf "Failed to locate gemini executable in file \"%s\" at line %d" "$config_file" "$current_line")
                    log_error "$message"
                    exit "$_CR_ERROR_EXIT_CODE"
                }
                ;;
            "codex_home")
                [ -d "$value" ] || {
                    message=$(printf "Invalid codex home directory \"%s\" in file \"%s\" at line %d" "$value" "$config_file" "$current_line")
                    log_error "$message"
                    exit "$_CR_ERROR_EXIT_CODE"
                }
                codex_home="$value"
                ;;
            "claude_home")
                [ -d "$value" ] || {
                    message=$(printf "Invalid claude home directory \"%s\" in file \"%s\" at line %d" "$value" "$config_file" "$current_line")
                    log_error "$message"
                    exit "$_CR_ERROR_EXIT_CODE"
                }
                claude_home="$value"
                ;;
            "copilot_home")
                [ -d "$value" ] || {
                    message=$(printf "Invalid copilot home directory \"%s\" in file \"%s\" at line %d" "$value" "$config_file" "$current_line")
                    log_error "$message"
                    exit "$_CR_ERROR_EXIT_CODE"
                }
                copilot_home="$value"
                ;;
            "gemini_home")
                [ -d "$value" ] || {
                    message=$(printf "Invalid gemini home directory \"%s\" in file \"%s\" at line %d" "$value" "$config_file" "$current_line")
                    log_error "$message"
                    exit "$_CR_ERROR_EXIT_CODE"
                }
                gemini_home="$value"
                ;;
            *)
                message=$(printf "Unknown configuration key \"%s\" in file \"%s\" at line %d" "$key" "$config_file" "$current_line")
                log_error "$message"
                exit "$_CR_ERROR_EXIT_CODE"
                ;;
        esac
    done < "$config_file"
}

_parse_short_options()
{
    opts=${1#-}
    while [ -n "$opts" ]; do
        char=${opts%"${opts#?}"}
        opts=${opts#?}
        case "$char" in
            v)
                log_level=2
                reinit_log
                continue
                ;;
            q)
                log_level=0
                reinit_log
                continue
                ;;
        esac

        eval "argv_$argc=-$char"
        argc=$(($argc + 1))
    done
}
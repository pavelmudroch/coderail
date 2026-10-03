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

    # if possible in pure POSIX, read all environment variables and check for *_HOME and *_COMMAND
    # to override connectors

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
            *_command)
                # parse key for <connector>_command
                ;;
            *_home)
                # parse key for <connector>_home
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
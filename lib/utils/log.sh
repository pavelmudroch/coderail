#!/usr/bin/env sh

_bar="################################################################################"
_CL=$(printf '\033[0K')

_terminal_width()
{
    width=$(tput cols) || width=80

    case $width in
        ''|*[!0-9]*)
            width=80
            ;;
    esac

    [ "$width" -le 80 ] || width=80
    printf '%s\n' "$width"
}

_log_cleanup()
{
    [ "$log_spinner_pid" -ne -1 ] || return 0
    kill "$log_spinner_pid" 2>/dev/null || true
    wait "$log_spinner_pid" 2>/dev/null || true
}

color_red()
{
    printf '%s%s%s' "$log_color_red" "$1" "$log_color_reset"
}

color_yellow()
{
    printf '%s%s%s' "$log_color_yellow" "$1" "$log_color_reset"
}

color_green()
{
    printf '%s%s%s' "$log_color_green" "$1" "$log_color_reset"
}

color_gray()
{
    printf '%s%s%s' "$log_color_gray" "$1" "$log_color_reset"
}

color_blue()
{
    printf '%s%s%s' "$log_color_blue" "$1" "$log_color_reset"
}

color_cyan()
{
    printf '%s%s%s' "$log_color_cyan" "$1" "$log_color_reset"
}

color_magenta()
{
    printf '%s%s%s' "$log_color_magenta" "$1" "$log_color_reset"
}

style_bold()
{
    printf '%s%s%s' "$log_style_bold" "$1" "$log_color_reset"
}

style_cursive()
{
    printf '%s%s%s' "$log_style_cursive" "$1" "$log_color_reset"
}

color_inverse()
{
    printf '%s%s%s' "$log_color_inverse" "$1" "$log_color_reset"
}

output()
{
    if [ "$log_in_spinner" -eq 1 ] || [ "$log_in_progress" -eq 1 ]; then
        printf "%s" "$_CL" >&2
    fi

    printf '%s\n' "$*" >&1

    if [ "$log_in_progress" -eq 1 ]; then
        progress_bar "$log_bar_percentage"
    fi

    if [ "$log_in_spinner" -eq 1 ]; then
        printf "%s" "$log_spinner_current" >&2
    fi
}

log_error()
{
    printf '%serror:%s %s%s\n' "$log_color_red" "$log_color_reset" "$*" "$_CL" >&2

    if [ "$log_in_progress" -eq 1 ]; then
        progress_bar "$log_bar_percentage"
    fi

    if [ "$log_in_spinner" -eq 1 ]; then
        printf "%s" "$log_spinner_current" >&2
    fi
}

log_warn()
{
    [ "$log_level" -ge 1 ] || return 0
    printf '%swarning:%s %s%s\n' "$log_color_yellow" "$log_color_reset" "$*" "$_CL" >&2

    if [ "$log_in_progress" -eq 1 ]; then
        progress_bar "$log_bar_percentage"
    fi

    if [ "$log_in_spinner" -eq 1 ]; then
        printf "%s" "$log_spinner_current" >&2
    fi
}

log_info()
{
    [ "$log_level" -ge 1 ] || return 0
    printf '%s%s\n' "$*" "$_CL" >&2

    if [ "$log_in_progress" -eq 1 ]; then
        progress_bar "$log_bar_percentage"
    fi

    if [ "$log_in_spinner" -eq 1 ]; then
        printf "%s" "$log_spinner_current" >&2
    fi
}

log_verbose()
{
    [ "$log_level" -ge 2 ] || return 0
    printf '%sverbose: %s%s%s\n' "$log_color_gray" "$*" "$log_color_reset" "$_CL" >&2

    if [ "$log_in_progress" -eq 1 ]; then
        progress_bar "$log_bar_percentage"
    fi

    if [ "$log_in_spinner" -eq 1 ]; then
        printf "%s" "$log_spinner_current" >&2
    fi
}

progress_bar()
{
    [ "$log_in_spinner" -eq 1 ] && spinner_close
    [ "$log_interactive" -eq 1 ] || return 0
    log_in_progress=1
    log_bar_percentage=$1
    [ "$log_bar_percentage" -ge 0 ] || log_bar_percentage=0
    [ "$log_bar_percentage" -le 100 ] || log_bar_percentage=100
    width=$(($(_terminal_width) - 8))
    filled_width=$(($width * $log_bar_percentage / 100))
    empty_width=$(($width - $filled_width))
    printf " [%s%.${filled_width}s%-*s%s] %*s%%\r" "$log_color_gray" "$_bar" "$empty_width" "" "$log_color_reset" "3" "$log_bar_percentage" >&2
}

progress_bar_close()
{
    [ "$log_interactive" -eq 1 ] || return 0
    [ "$log_in_progress" -eq 1 ] || return 0
    log_in_progress=0
    log_bar_percentage=0
    printf "%s" "$_CL" >&2
}

spinner()
{
    [ "$log_in_spinner" -eq 1 ] && spinner_close
    [ "$log_in_progress" -eq 1 ] && progress_bar_close
    [ "$log_interactive" -eq 1 ] || return 0
    log_in_spinner=1
    message="$1"
    [ -n "$message" ] || message="Working"

    (
        while :
        do
            for dots in '.' '..' '...'
            do
                printf '\r\033[K %s%s\r' "$message" "$dots" >&2
                log_spinner_current=" $message$dots\r"
                sleep 1
            done
        done
    ) &

    log_spinner_pid=$!
}

spinner_close()
{
    [ "$log_interactive" -eq 1 ] || return 0
    [ "$log_in_spinner" -eq 1 ] || return 0
    [ "$log_spinner_pid" -ne -1 ] || return 0
    kill "$log_spinner_pid" 2>/dev/null || true
    wait "$log_spinner_pid" 2>/dev/null || true
    log_spinner_pid=-1
    log_in_spinner=0
    printf '\r\033[K' >&2
}

_init_log()
{
    : "${log_level:=1}"
    : "${log_color:=1}"
    : "${log_interactive:=1}"
    : "${log_in_progress:=0}"
    : "${log_bar_percentage:=0}"
    : "${log_in_spinner:=0}"
    : "${log_spinner_current:=}"
    : "${log_spinner_pid:=-1}"

    case $log_level in
        0|1|2)
            ;;
        *)
            log_warning "invalid log level: $log_level, using default log level 1"
            log_level=1
            ;;
    esac

    if [ "$log_color" -eq 1 ] &&
    [ "$log_level" -ge 1 ] &&
    tty -s <&2
    then
        log_color=1
    else
        log_color=0
    fi

    if [ "$log_interactive" -eq 1 ] &&
    [ "$log_level" -ge 1 ] &&
    tty -s <&2
    then
        log_interactive=1
    else
        log_interactive=0
    fi

    if [ "$log_color" -eq 1 ]; then
        log_color_red=$(printf '\033[31m')
        log_color_yellow=$(printf '\033[33m')
        log_color_green=$(printf '\033[32m')
        log_color_reset=$(printf '\033[0m')
        log_color_gray=$(printf '\033[90m')
        log_color_blue=$(printf '\033[34m')
        log_color_cyan=$(printf '\033[36m')
        log_color_magenta=$(printf '\033[35m')
        log_style_bold=$(printf '\033[1m')
        log_style_cursive=$(printf '\033[3m')
        log_color_inverse=$(printf '\033[7m')
    else
        log_color_red=''
        log_color_yellow=''
        log_color_green=''
        log_color_reset=''
        log_color_gray=''
        log_color_blue=''
        log_color_cyan=''
        log_color_magenta=''
        log_style_bold=''
        log_style_cursive=''
        log_color_inverse=''
    fi
}

reinit_log()
{
    _init_log
}
#!/usr/bin/env sh

_bar="################################################################################"
_CL=$(printf '\033[0K')

_terminal_width()
{
    width=$(tput cols 2>/dev/null) || width=80

    case $width in
        ''|*[!0-9]*)
            width=80
            ;;
    esac

    [ "$width" -le 80 ] || width=80
    printf '%s\n' "$width"
}

log_error()
{
    printf '%serror:%s %s%s\n' "$log_color_red" "$log_color_reset" "$*" "$_CL" >&2

    if [ "$log_in_progress" -eq 1 ]; then
        progress_bar "$log_bar_percentage"
    fi
}

log_warn()
{
    [ "$log_level" -ge 1 ] || return 0
    printf '%swarning:%s %s%s\n' "$log_color_yellow" "$log_color_reset" "$*" "$_CL" >&2

    if [ "$log_in_progress" -eq 1 ]; then
        progress_bar "$log_bar_percentage"
    fi
}

log_info()
{
    [ "$log_level" -ge 1 ] || return 0
    printf '%s%s\n' "$*" "$_CL" >&2

    if [ "$log_in_progress" -eq 1 ]; then
        progress_bar "$log_bar_percentage"
    fi
}

log_verbose()
{
    [ "$log_level" -ge 2 ] || return 0
    printf '%sverbose: %s%s%s\n' "$log_color_gray" "$*" "$log_color_reset" "$_CL" >&2

    if [ "$log_in_progress" -eq 1 ]; then
        progress_bar "$log_bar_percentage"
    fi
}

progress_bar()
{
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


: "${log_level:=1}"
: "${log_color:=1}"
: "${log_interactive:=1}"
: "${log_in_progress:=0}"
: "${log_bar_percentage:=0}"

case $log_level in
    0|1|2)
        ;;
    *)
        log_error "invalid log level: $log_level"
        log_level=1
        ;;
esac

if [ "$log_color" -eq 1 ] &&
   [ "$log_level" -ge 1 ] &&
   [ -z "${NO_COLOR:-}" ] &&
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
else
    log_color_red=''
    log_color_yellow=''
    log_color_green=''
    log_color_reset=''
    log_color_gray=''
fi

log_error "Some fatal error occurred"
log_warn "This is a warning message"
log_info "This is an informational message"
log_verbose "This is a verbose message"
log_info "Processing"
progress_bar 0
sleep 1
progress_bar 13
sleep 1
progress_bar 27
sleep 1
progress_bar 36
sleep 1
progress_bar 42
sleep 1
log_info "Post-Processing"
progress_bar 56
sleep 1
progress_bar 61
sleep 1
progress_bar 73
sleep 1
progress_bar 87
sleep 1
log_verbose "This is an informational message during progress"
progress_bar 92
sleep 1
progress_bar 98
sleep 1
progress_bar 100
sleep 1
progress_bar_close
sleep 1
log_info "Done"
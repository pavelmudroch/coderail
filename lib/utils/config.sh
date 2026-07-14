#!/usr/bin/env sh

config_trim() {
    printf '%s\n' "$1" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

read_default_tool_config() {
    config_file=$1

    [ -e "$config_file" ] || return 0
    [ -f "$config_file" ] || return 0
    [ -r "$config_file" ] || error "unreadable config: $config_file"

    while IFS= read -r raw_line || [ -n "$raw_line" ]; do
        line_without_comment=${raw_line%%#*}
        line=$(config_trim "$line_without_comment")

        [ -n "$line" ] || continue

        case "$line" in
            *=*)
                key=${line%%=*}
                value=${line#*=}
                key=$(config_trim "$key")
                value=$(config_trim "$value")

                [ "$key" = default_tool ] || continue
                default_tool=$value
                ;;
        esac
    done < "$config_file"
}

load_default_tool() {
    default_tool=

    if [ -n "${HOME:-}" ]; then
        read_default_tool_config "$HOME/.coderail/config.ini"
    fi

    read_default_tool_config ".coderail/conf.ini"
}

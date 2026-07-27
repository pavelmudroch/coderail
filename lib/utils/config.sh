#!/usr/bin/env sh

config_trim() {
    printf '%s\n' "$1" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

config_error() {
    error "invalid config: $1: $2"
}

config_find_repository_base() {
    config_base_dir=$1

    if config_git_root=$(
        CDPATH= cd -- "$config_base_dir" &&
            git rev-parse --show-toplevel 2>/dev/null
    ); then
        printf '%s\n' "$config_git_root"
        return 0
    fi

    CDPATH= cd -- "$config_base_dir" && pwd
}

config_read_layer() {
    config_layer_file=$1
    config_layer_inaccessible_path=${2:-$config_layer_file}
    config_layer_default_tool=
    config_layer_auto_review=
    config_layer_has_default_tool=false
    config_layer_has_auto_review=false

    config_layer_dir=${config_layer_file%/*}
    if [ -d "$config_layer_dir" ] && [ ! -x "$config_layer_dir" ]; then
        if [ -r "$config_layer_dir" ]; then
            for config_layer_entry in "$config_layer_dir"/*; do
                [ "$config_layer_entry" = "$config_layer_file" ] || continue
                config_error "$config_layer_file" "unreadable"
            done
        else
            config_error "$config_layer_inaccessible_path" "unreadable"
        fi
    fi

    [ -e "$config_layer_file" ] || [ -L "$config_layer_file" ] || return 0
    [ -f "$config_layer_file" ] ||
        config_error "$config_layer_file" "not a regular file"
    [ -r "$config_layer_file" ] ||
        config_error "$config_layer_file" "unreadable"

    config_line_number=0
    while IFS= read -r config_raw_line || [ -n "$config_raw_line" ]; do
        config_line_number=$((config_line_number + 1))
        config_line=${config_raw_line%%#*}
        config_line=$(config_trim "$config_line")

        [ -n "$config_line" ] || continue

        case "$config_line" in
            *=*)
                config_key=${config_line%%=*}
                config_value=${config_line#*=}
                config_key=$(config_trim "$config_key")
                config_value=$(config_trim "$config_value")
                ;;
            *)
                config_error "$config_layer_file" \
                    "malformed line $config_line_number"
                ;;
        esac

        [ -n "$config_key" ] || config_error "$config_layer_file" "empty key"
        [ -n "$config_value" ] || config_error "$config_layer_file" "empty value"

        case "$config_key" in
            default_tool)
                [ "$config_layer_has_default_tool" = false ] ||
                    config_error "$config_layer_file" \
                        "duplicate key: default_tool"

                case "$config_value" in
                    codex|claude|copilot|gemini)
                        ;;
                    *)
                        config_error "$config_layer_file" \
                            "invalid value for default_tool: $config_value"
                        ;;
                esac

                config_layer_default_tool=$config_value
                config_layer_has_default_tool=true
                ;;
            auto_review)
                [ "$config_layer_has_auto_review" = false ] ||
                    config_error "$config_layer_file" \
                        "duplicate key: auto_review"

                case "$config_value" in
                    true|false)
                        ;;
                    *)
                        config_error "$config_layer_file" \
                            "invalid value for auto_review: $config_value"
                        ;;
                esac

                config_layer_auto_review=$config_value
                config_layer_has_auto_review=true
                ;;
            *)
                config_error "$config_layer_file" \
                    "unknown key: $config_key"
                ;;
        esac
    done < "$config_layer_file"
}

config_apply_layer() {
    if [ "$1" = true ]; then
        default_tool=$2
    fi

    if [ "$3" = true ]; then
        auto_review=$4
    fi
}

load_effective_config() {
    config_base_dir=$1
    default_tool=
    auto_review=

    config_user_default_tool=
    config_user_auto_review=
    config_user_has_default_tool=false
    config_user_has_auto_review=false
    if [ -n "${HOME:-}" ]; then
        config_user_file=$HOME/.coderail/config.ini
        config_read_layer "$config_user_file"
        config_user_default_tool=$config_layer_default_tool
        config_user_auto_review=$config_layer_auto_review
        config_user_has_default_tool=$config_layer_has_default_tool
        config_user_has_auto_review=$config_layer_has_auto_review
    fi

    config_repository_base=$(config_find_repository_base "$config_base_dir") ||
        error "failed to determine configuration directory: $config_base_dir"
    config_legacy_file=$config_repository_base/.coderail/conf.ini
    config_canonical_file=$config_repository_base/.coderail/config.ini

    config_legacy_present=false
    if [ -e "$config_legacy_file" ] || [ -L "$config_legacy_file" ]; then
        config_legacy_present=true
    fi
    config_read_layer \
        "$config_legacy_file" \
        "$config_legacy_file or $config_canonical_file"
    config_legacy_default_tool=$config_layer_default_tool
    config_legacy_auto_review=$config_layer_auto_review
    config_legacy_has_default_tool=$config_layer_has_default_tool
    config_legacy_has_auto_review=$config_layer_has_auto_review

    config_canonical_present=false
    if [ -e "$config_canonical_file" ] || [ -L "$config_canonical_file" ]; then
        config_canonical_present=true
    fi
    config_read_layer "$config_canonical_file"
    config_canonical_default_tool=$config_layer_default_tool
    config_canonical_auto_review=$config_layer_auto_review
    config_canonical_has_default_tool=$config_layer_has_default_tool
    config_canonical_has_auto_review=$config_layer_has_auto_review

    config_apply_layer \
        "$config_user_has_default_tool" \
        "$config_user_default_tool" \
        "$config_user_has_auto_review" \
        "$config_user_auto_review"
    config_apply_layer \
        "$config_legacy_has_default_tool" \
        "$config_legacy_default_tool" \
        "$config_legacy_has_auto_review" \
        "$config_legacy_auto_review"
    config_apply_layer \
        "$config_canonical_has_default_tool" \
        "$config_canonical_default_tool" \
        "$config_canonical_has_auto_review" \
        "$config_canonical_auto_review"

    if [ "$config_legacy_present" = true ]; then
        if [ "$config_canonical_present" = true ]; then
            printf '%s\n' \
                "warning: using repository config.ini, but deprecated repository config $config_legacy_file found" \
                >&2
        else
            printf '%s\n' \
                "warning: deprecated repository config $config_legacy_file; rename it to config.ini" \
                >&2
        fi
    fi
}

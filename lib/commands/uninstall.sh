#!/usr/bin/env sh

set -eu

script_path=$0

while [ -L "$script_path" ]; do
    script_dir=$(
        CDPATH= cd -- "$(dirname "$script_path")"
        pwd
    )
    link_target=$(readlink "$script_path")

    case "$link_target" in
        /*) script_path=$link_target ;;
        *) script_path=$script_dir/$link_target ;;
    esac
done

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$script_path")"
    pwd
)

ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/../.."
    pwd
)

. "$ROOT_DIR/lib/utils/log.sh"

usage() {
    cat <<'EOF'
Usage:
  cr uninstall [options] <tool ...>

  Uninstall instructions for selected agent-based tool.

Options:
  -h, --help            Show this help message and exit
  -f, --force           Allow removing modified installation files

Tools:
  codex
  copilot
  claude
  gemini
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

uninstall_error() {
    echo "error: $*" >&2
    exit 1
}

add_tool() {
    case "$1" in
        codex|copilot|claude|gemini)
            ;;
        *)
            error "unknown tool: $1"
            ;;
    esac

    if [ -n "$tools" ]; then
        tools="${tools}
$1"
    else
        tools=$1
    fi

    tool_count=$((tool_count + 1))
}

default_target_root() {
    suffix=$1

    [ -n "${HOME:-}" ] || uninstall_error "HOME is not set"
    printf '%s/%s\n' "$HOME" "$suffix"
}

target_root() {
    case "$1" in
        codex)
            if [ -n "${CODERAIL_CODEX_HOME:-}" ]; then
                printf '%s\n' "$CODERAIL_CODEX_HOME"
            else
                default_target_root .codex
            fi
            ;;
        copilot)
            if [ -n "${CODERAIL_COPILOT_HOME:-}" ]; then
                printf '%s\n' "$CODERAIL_COPILOT_HOME"
            else
                default_target_root .copilot
            fi
            ;;
        claude)
            if [ -n "${CODERAIL_CLAUDE_HOME:-}" ]; then
                printf '%s\n' "$CODERAIL_CLAUDE_HOME"
            else
                default_target_root .claude
            fi
            ;;
        gemini)
            if [ -n "${CODERAIL_GEMINI_HOME:-}" ]; then
                printf '%s\n' "$CODERAIL_GEMINI_HOME"
            else
                default_target_root .gemini
            fi
            ;;
        *)
            uninstall_error "unknown tool: $1"
            ;;
    esac
}

manifest_path_from_line() {
    manifest_line=$1
    rel_path=$(printf '%s\n' "$manifest_line" | sed 's/^[0-9][0-9]* [0-9][0-9]* //')

    [ "$rel_path" != "$manifest_line" ] ||
        uninstall_error "invalid install manifest line: $manifest_line"

    printf '%s\n' "$rel_path"
}

validate_manifest_path() {
    rel_path=$1

    case "$rel_path" in
        ""|/*|.|..|../*|*/..|*/../*|./*|*/./*)
            uninstall_error "invalid install manifest path: $rel_path"
            ;;
    esac
}

checksum_line() {
    root_dir=$1
    rel_path=$2

    (
        cd "$root_dir"
        cksum "$rel_path"
    )
}

validate_managed_file() {
    tool_root=$1
    manifest_line=$2
    rel_path=$(manifest_path_from_line "$manifest_line")
    target_file=$tool_root/$rel_path

    validate_manifest_path "$rel_path"

    [ -e "$target_file" ] || return 0
    [ -f "$target_file" ] ||
        uninstall_error "managed path is not a regular file: $target_file"

    [ "$uninstall_force" != true ] || return 0

    current_line=$(checksum_line "$tool_root" "$rel_path")

    [ "$current_line" = "$manifest_line" ] ||
        uninstall_error "refusing to remove modified managed file: $target_file"
}

validate_uninstall() {
    tool_root=$1
    manifest_file=$tool_root/.coderail-install

    [ -e "$tool_root" ] || return 0
    [ -d "$tool_root" ] ||
        uninstall_error "tool root exists and is not a directory: $tool_root"
    [ -f "$manifest_file" ] || return 0

    log_notice "validating uninstall at $tool_root"

    while IFS= read -r manifest_line || [ -n "$manifest_line" ]; do
        [ -n "$manifest_line" ] || continue
        validate_managed_file "$tool_root" "$manifest_line"
    done < "$manifest_file"
}

remove_empty_parent_dirs() {
    tool_root=$1
    rel_path=$2
    rel_dir=$(dirname "$rel_path")

    while [ "$rel_dir" != "." ]; do
        rmdir "$tool_root/$rel_dir" 2>/dev/null || return 0

        case "$rel_dir" in
            */*) rel_dir=${rel_dir%/*} ;;
            *) rel_dir=. ;;
        esac
    done
}

remove_managed_files() {
    tool_root=$1
    manifest_file=$tool_root/.coderail-install

    [ -f "$manifest_file" ] || return 0

    while IFS= read -r manifest_line || [ -n "$manifest_line" ]; do
        [ -n "$manifest_line" ] || continue
        rel_path=$(manifest_path_from_line "$manifest_line")
        validate_manifest_path "$rel_path"
        target_file=$tool_root/$rel_path

        if [ -e "$target_file" ]; then
            rm -f "$target_file"
        fi

        log_notice "removed managed file: $rel_path"
        remove_empty_parent_dirs "$tool_root" "$rel_path"
    done < "$manifest_file"

    rm -f "$manifest_file"
    rmdir "$tool_root" 2>/dev/null || :
}

uninstall_tool() {
    tool=$1
    log_info "Uninstalling tool: $tool"
    tool_root=$(target_root "$tool")
    log_notice "root set to: $tool_root"

    validate_uninstall "$tool_root"
    remove_managed_files "$tool_root"
}

uninstall_force=false
tools=
tool_count=0

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || error "unexpected argument: $1"
            usage
            exit 0
            ;;
        -f|--force)
            uninstall_force=true
            shift
            ;;
        --)
            shift
            break
            ;;
        --*)
            error "unknown option: $1"
            ;;
        -*)
            error "unknown option: $1"
            ;;
        *)
            add_tool "$1"
            shift
            ;;
    esac
done

while [ "$#" -gt 0 ]; do
    add_tool "$1"
    shift
done

[ "$tool_count" -gt 0 ] || error "missing tool"

for tool in $tools; do
    uninstall_tool "$tool"
done

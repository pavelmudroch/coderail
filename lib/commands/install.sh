#!/usr/bin/env sh

set -eu

script_path=$0

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$script_path")"
    pwd
)

ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/../.."
    pwd
)

. "$ROOT_DIR/lib/utils/log.sh"
. "$ROOT_DIR/lib/utils/config.sh"

TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-install.XXXXXX")

cleanup() {
    log_notice "Cleaning up temporary files"
    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

usage() {
    cat <<'EOF'
Usage:
  cr install [options] [<tool> ...]

  Install instructions for specific agent-based tool.

Options:
  -h, --help            Show this help message and exit
  -f, --force           Allow overwriting untracked and modified existing
                        installation files

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

install_error() {
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

    tools="$tools $1"
    tool_count=$((tool_count + 1))
}

default_target_root() {
    suffix=$1

    [ -n "${HOME:-}" ] || install_error "HOME is not set"
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
            install_error "unknown tool: $1"
            ;;
    esac
}

root_instruction_file_name() {
    case "$1" in
        codex) printf 'AGENTS.md\n' ;;
        copilot) printf 'copilot-instructions.md\n' ;;
        claude) printf 'CLAUDE.md\n' ;;
        gemini) printf 'GEMINI.md\n' ;;
        *) install_error "unknown tool: $1" ;;
    esac
}

validate_manifest_path() {
    rel_path=$1

    case "$rel_path" in
        ""|/*|.|..|../*|*/..|*/../*|./*|*/./*|*/.)
            install_error "invalid install manifest path: $rel_path"
            ;;
    esac
}

relative_path() {
    path=$1
    base=$2

    case "$path" in
        "$base"/*)
            rel_path=${path#"$base"/}
            validate_manifest_path "$rel_path"
            printf '%s\n' "$rel_path"
            ;;
        *) install_error "$path is not under $base" ;;
    esac
}

translate_file() {
    tool=$1
    source_file=$2
    target_file=$3

    case "$tool" in
        codex)
            sed 's#<skill>\([^<]*\)</skill>#$\1#g' "$source_file" > "$target_file"
            ;;
        copilot|claude|gemini)
            sed 's#<skill>\([^<]*\)</skill>#/\1#g' "$source_file" > "$target_file"
            ;;
        *)
            install_error "unknown tool: $tool"
            ;;
    esac
}

render_skill_file() {
    tool=$1
    source_file=$2
    target_file=$3
    target_tmp=$target_file.tmp.$$

    if ! awk -v tool="$tool" -v source_file="$source_file" '
        function trim(value) {
            gsub(/^[[:space:]]+/, "", value)
            gsub(/[[:space:]]+$/, "", value)
            return value
        }

        function invocation_policy(key, value) {
            value = trim(value)

            if (value != "true" && value != "false") {
                printf "error: invalid invocation policy in %s: %s must be true or false\n", source_file, key > "/dev/stderr"
                exit 1
            }

            if (key == "disable-model-invocation") {
                return value == "true" ? "user-only" : "both"
            }

            return value == "false" ? "user-only" : "both"
        }

        NR == 1 && $0 == "---" {
            in_frontmatter = 1
            policy_seen = 0
            policy = "both"
            print
            next
        }

        in_frontmatter && $0 == "---" {
            if (policy == "user-only" && tool == "codex") {
                print "allow_implicit_invocation: false"
            }
            if (policy == "user-only" && (tool == "copilot" || tool == "claude" || tool == "gemini")) {
                print "disable-model-invocation: true"
            }
            print
            in_frontmatter = 0
            next
        }

        in_frontmatter {
            key = $0
            sub(/[[:space:]]*:.*/, "", key)
            key = trim(key)

            if (key == "disable-model-invocation" || key == "allow_implicit_invocation") {
                value = $0
                sub(/^[^:]*:[[:space:]]*/, "", value)
                current_policy = invocation_policy(key, value)

                if (policy_seen && policy != current_policy) {
                    printf "error: conflicting invocation policy in %s\n", source_file > "/dev/stderr"
                    exit 1
                }

                policy_seen = 1
                policy = current_policy
                next
            }
        }

        { print }
    ' "$source_file" > "$target_tmp"; then
        rm -f "$target_tmp"
        install_error "failed to render skill: $source_file"
    fi

    translate_file "$tool" "$target_tmp" "$target_file"
    rm -f "$target_tmp"
}

frontmatter_value() {
    key=$1
    source_file=$2

    awk -v key="$key" '
        NR == 1 && $0 == "---" {
            in_frontmatter = 1
            next
        }

        in_frontmatter && $0 == "---" {
            exit
        }

        in_frontmatter {
            current_key = $0
            sub(/[[:space:]]*:.*/, "", current_key)
            if (current_key == key) {
                sub(/^[^:]*:[[:space:]]*/, "", $0)
                print
                exit
            }
        }
    ' "$source_file"
}

frontmatter_body() {
    source_file=$1

    awk '
        NR == 1 && $0 == "---" {
            in_frontmatter = 1
            next
        }

        in_frontmatter && $0 == "---" {
            in_frontmatter = 0
            next
        }

        !in_frontmatter {
            print
        }
    ' "$source_file"
}

toml_escape() {
    printf '%s\n' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

render_codex_agent() {
    codex_agent_source=$1
    codex_agent_target=$2
    codex_agent_body_tmp=$codex_agent_target.body.$$
    codex_agent_body_translated_tmp=$codex_agent_target.body-translated.$$
    codex_agent_name=$(frontmatter_value name "$codex_agent_source")
    codex_agent_description=$(frontmatter_value description "$codex_agent_source")

    [ -n "$codex_agent_name" ] || install_error "missing agent name: $codex_agent_source"
    [ -n "$codex_agent_description" ] || install_error "missing agent description: $codex_agent_source"

    frontmatter_body "$codex_agent_source" > "$codex_agent_body_tmp"
    translate_file codex "$codex_agent_body_tmp" "$codex_agent_body_translated_tmp"

    {
        printf 'name = "%s"\n' "$(toml_escape "$codex_agent_name")"
        printf 'description = "%s"\n' "$(toml_escape "$codex_agent_description")"
        printf 'developer_instructions = """\n'
        cat "$codex_agent_body_translated_tmp"
        printf '"""\n'
    } > "$codex_agent_target"

    rm -f "$codex_agent_body_tmp" "$codex_agent_body_translated_tmp"
}

render_agent_file() {
    tool=$1
    source_file=$2
    target_file=$3

    case "$tool" in
        codex)
            render_codex_agent "$source_file" "$target_file"
            ;;
        copilot|claude)
            translate_file "$tool" "$source_file" "$target_file"
            ;;
        gemini)
            ;;
        *)
            install_error "unknown tool: $tool"
            ;;
    esac
}

render_skills() {
    tool=$1
    stage_dir=$2
    source_dir=$ROOT_DIR/instructions/skills

    find "$source_dir" -type f | sort | while IFS= read -r source_file; do
        rel_path=$(relative_path "$source_file" "$source_dir")
        target_file=$stage_dir/skills/$rel_path

        mkdir -p "$(dirname "$target_file")"

        relative_file_path="skills/${source_file#*/skills/}"
        log_notice "installing $relative_file_path for $tool"

        case "$rel_path" in
            */SKILL.md|SKILL.md)
                render_skill_file "$tool" "$source_file" "$target_file"
                ;;
            *.md)
                translate_file "$tool" "$source_file" "$target_file"
                ;;
            *)
                cp "$source_file" "$target_file"
                ;;
        esac
    done
}

render_agents() {
    tool=$1
    stage_dir=$2
    source_dir=$ROOT_DIR/instructions/agents

    [ "$tool" != gemini ] || return 0
    [ -d "$source_dir" ] || return 0

    find "$source_dir" -type f -name '*.md' | sort | while IFS= read -r source_file; do
        file_name=$(basename "$source_file")
        agent_name=${source_file##*/}
        agent_name=${agent_name%.md}

        log_notice "installing agents/$file_name for $tool"

        case "$tool" in
            codex) target_file=$stage_dir/agents/$agent_name.toml ;;
            copilot) target_file=$stage_dir/agents/$agent_name.agent.md ;;
            claude) target_file=$stage_dir/agents/$agent_name.md ;;
            *) install_error "unknown tool: $tool" ;;
        esac

        mkdir -p "$(dirname "$target_file")"
        render_agent_file "$tool" "$source_file" "$target_file"
    done
}

render_tool() {
    tool=$1
    stage_dir=$2
    root_file=$(root_instruction_file_name "$tool")

    mkdir -p "$stage_dir"
    translate_file "$tool" "$ROOT_DIR/instructions/AGENTS.md" "$stage_dir/$root_file"
    log_notice "installing $root_file for $tool"
    render_skills "$tool" "$stage_dir"
    render_agents "$tool" "$stage_dir"
}

build_manifest() {
    stage_dir=$1
    manifest_file=$2

    : > "$manifest_file"

    find "$stage_dir" -type f | sort | while IFS= read -r installed_file; do
        rel_path=$(relative_path "$installed_file" "$stage_dir")
        (
            cd "$stage_dir"
            cksum "$rel_path"
        ) >> "$manifest_file"
    done

    validate_manifest_file "$manifest_file"
}

manifest_path_from_line() {
    manifest_line=$1
    rel_path=$(printf '%s\n' "$manifest_line" | sed 's/^[0-9][0-9]* [0-9][0-9]* //')

    [ "$rel_path" != "$manifest_line" ] ||
        install_error "invalid install manifest line: $manifest_line"

    validate_manifest_path "$rel_path"
    printf '%s\n' "$rel_path"
}

manifest_path_exists() {
    manifest_file=$1
    rel_path=$2

    manifest_line_for_path "$manifest_file" "$rel_path" >/dev/null
}

manifest_line_for_path() {
    manifest_file=$1
    rel_path=$2

    validate_manifest_path "$rel_path"
    [ -f "$manifest_file" ] || return 1

    while IFS= read -r manifest_line || [ -n "$manifest_line" ]; do
        [ -n "$manifest_line" ] || continue
        current_path=$(manifest_path_from_line "$manifest_line") || return 1

        if [ "$current_path" = "$rel_path" ]; then
            printf '%s\n' "$manifest_line"
            return 0
        fi
    done < "$manifest_file"

    return 1
}

manifest_paths() {
    manifest_file=$1

    while IFS= read -r manifest_line || [ -n "$manifest_line" ]; do
        [ -n "$manifest_line" ] || continue
        manifest_path_from_line "$manifest_line"
    done < "$manifest_file"
}

validate_manifest_file() {
    manifest_file=$1

    [ -f "$manifest_file" ] ||
        install_error "install manifest does not exist: $manifest_file"

    while IFS= read -r manifest_line || [ -n "$manifest_line" ]; do
        [ -n "$manifest_line" ] || continue
        manifest_path_from_line "$manifest_line" >/dev/null
    done < "$manifest_file"
}

checksum_line() {
    root_dir=$1
    rel_path=$2

    validate_manifest_path "$rel_path"

    (
        cd "$root_dir"
        cksum "$rel_path"
    )
}

validate_target_file() {
    tool_root=$1
    old_manifest=$2
    rel_path=$3

    validate_manifest_path "$rel_path"

    target_file=$tool_root/$rel_path

    [ -e "$target_file" ] || return 0
    [ -f "$target_file" ] || install_error "target path is not a regular file: $target_file"

    if manifest_path_exists "$old_manifest" "$rel_path"; then
        old_line=$(manifest_line_for_path "$old_manifest" "$rel_path")
        current_line=$(checksum_line "$tool_root" "$rel_path")

        if [ "$current_line" != "$old_line" ] && [ "$install_force" != true ]; then
            install_error "refusing to overwrite modified managed file: $target_file"
        fi
        return 0
    fi

    [ "$install_force" = true ] ||
        install_error "refusing to overwrite untracked file: $target_file"
}

validate_stale_file() {
    tool_root=$1
    old_manifest=$2
    new_manifest=$3
    rel_path=$4

    validate_manifest_path "$rel_path"

    target_file=$tool_root/$rel_path

    manifest_path_exists "$new_manifest" "$rel_path" && return 0
    [ -e "$target_file" ] || return 0
    [ -f "$target_file" ] || install_error "managed path is not a regular file: $target_file"

    old_line=$(manifest_line_for_path "$old_manifest" "$rel_path")
    current_line=$(checksum_line "$tool_root" "$rel_path")

    if [ "$current_line" != "$old_line" ] && [ "$install_force" != true ]; then
        install_error "refusing to remove modified managed file: $target_file"
    fi
}

validate_install() {
    tool_root=$1
    stage_dir=$2
    new_manifest=$3
    old_manifest=$tool_root/.coderail-install

    log_notice "validating install at $tool_root"

    [ ! -e "$tool_root" ] || [ -d "$tool_root" ] ||
        install_error "tool root exists and is not a directory: $tool_root"

    validate_manifest_file "$new_manifest"
    if [ -f "$old_manifest" ]; then
        validate_manifest_file "$old_manifest"
    fi

    find "$stage_dir" -type f | sort | while IFS= read -r source_file; do
        rel_path=$(relative_path "$source_file" "$stage_dir")
        validate_target_file "$tool_root" "$old_manifest" "$rel_path"
    done

    [ -f "$old_manifest" ] || return 0

    manifest_paths "$old_manifest" | while IFS= read -r rel_path; do
        [ -n "$rel_path" ] || continue
        validate_stale_file "$tool_root" "$old_manifest" "$new_manifest" "$rel_path"
    done
}

remove_stale_files() {
    tool_root=$1
    new_manifest=$2
    old_manifest=$tool_root/.coderail-install

    [ -f "$old_manifest" ] || return 0

    validate_manifest_file "$old_manifest"
    validate_manifest_file "$new_manifest"

    manifest_paths "$old_manifest" | while IFS= read -r rel_path; do
        [ -n "$rel_path" ] || continue
        manifest_path_exists "$new_manifest" "$rel_path" && continue

        target_file=$tool_root/$rel_path
        [ -e "$target_file" ] || continue
        rm -f "$target_file"
        remove_empty_parent_dirs "$tool_root" "$rel_path"
    done
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

copy_staged_files() {
    tool_root=$1
    stage_dir=$2

    find "$stage_dir" -type f | sort | while IFS= read -r source_file; do
        rel_path=$(relative_path "$source_file" "$stage_dir")
        target_file=$tool_root/$rel_path

        mkdir -p "$(dirname "$target_file")"
        cp "$source_file" "$target_file"
    done
}

write_manifest() {
    tool_root=$1
    new_manifest=$2
    manifest_tmp=$tool_root/.coderail-install.tmp.$$

    validate_manifest_file "$new_manifest"
    cp "$new_manifest" "$manifest_tmp"
    mv "$manifest_tmp" "$tool_root/.coderail-install"
}

install_tool() {
    tool=$1
    log_info "Installing tool: $tool"
    tool_root=$(target_root "$tool")
    log_notice "root set to: $tool_root"
    tool_tmp=$tmp_dir/$tool
    stage_dir=$tool_tmp/stage
    new_manifest=$tool_tmp/manifest

    mkdir -p "$stage_dir"
    render_tool "$tool" "$stage_dir"
    build_manifest "$stage_dir" "$new_manifest"
    validate_install "$tool_root" "$stage_dir" "$new_manifest"
    mkdir -p "$tool_root"
    remove_stale_files "$tool_root" "$new_manifest"
    copy_staged_files "$tool_root" "$stage_dir"
    write_manifest "$tool_root" "$new_manifest"
}

install_force=false
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
            install_force=true
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

if [ "$tool_count" -eq 0 ]; then
    load_default_tool
    [ -n "$default_tool" ] || error "missing tool"
    add_tool "$default_tool"
fi

for tool in $tools; do
    install_tool "$tool"
done

#!/usr/bin/env sh

set -eu

usage() {
    cat <<'USAGE'
Usage:
  cr install [options] <tool> [...<tool>]

  Install instructions for specific agent-based tool

Options:
  --help                Show this help message and exit
  --force               Override untracked and modified files

Tools:
  codex
  copilot
  claude
USAGE
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 1
}

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)
ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/../.."
    pwd
)
INSTRUCTIONS_DIR=$ROOT_DIR/instructions

tools=
force=false
argument_count=$#

add_tool() {
    case "$1" in
        codex|copilot|claude)
            case " $tools " in
                *" $1 "*) error "tool provided multiple times: $1" ;;
                *) tools=${tools:+$tools }$1 ;;
            esac
            ;;
        *)
            error "unsupported tool: $1"
            ;;
    esac
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --help)
            [ "$argument_count" -eq 1 ] || error "--help must be the only argument"
            usage
            exit 0
            ;;
        --help=*)
            error "--help does not accept a value"
            ;;
        --force)
            [ "$force" = false ] || error "--force provided multiple times"
            force=true
            shift
            ;;
        --force=*)
            error "--force does not accept a value"
            ;;
        --*)
            error "unknown option: $1"
            ;;
        *)
            add_tool "$1"
            shift
            ;;
    esac
done

[ -n "$tools" ] || error "missing tool"
[ -d "$INSTRUCTIONS_DIR" ] || error "missing instructions directory: $INSTRUCTIONS_DIR"

ensure_parent_dir() {
    mkdir -p "$(dirname "$1")" || error "failed to create directory for $1"
}

write_file() {
    target=$1
    tmp=$2

    if [ -e "$target" ] && [ "$force" = false ]; then
        rm -f "$tmp"
        error "target already exists: $target (use --force to override)"
    fi

    ensure_parent_dir "$target"
    mv "$tmp" "$target" || error "failed to install $target"
}

translate_tags() {
    prefix=$1
    input=$2
    output=$3

    awk -v prefix="$prefix" '
    {
        line = $0
        while (match(line, /<skill>[A-Za-z0-9._-]+<\/skill>/)) {
            tag = substr(line, RSTART, RLENGTH)
            name = tag
            sub(/^<skill>/, "", name)
            sub(/<\/skill>$/, "", name)
            line = substr(line, 1, RSTART - 1) prefix name substr(line, RSTART + RLENGTH)
        }
        print line
    }
    ' "$input" > "$output" || error "failed to translate $input"
}

install_tree() {
    source_dir=$1
    target_dir=$2
    prefix=$3
    extension=$4

    [ -d "$source_dir" ] || return 0

    find "$source_dir" -type f | while IFS= read -r source_file; do
        relative=${source_file#"$source_dir"/}
        case "$extension" in
            '') target_file=$target_dir/$relative ;;
            *) target_file=$target_dir/${relative%.*}.$extension ;;
        esac
        tmp=${target_file}.tmp.$$
        ensure_parent_dir "$target_file"
        translate_tags "$prefix" "$source_file" "$tmp"
        write_file "$target_file" "$tmp"
    done
}

install_main_instruction() {
    target=$1
    prefix=$2
    tmp=${target}.tmp.$$
    ensure_parent_dir "$target"

    translate_tags "$prefix" "$INSTRUCTIONS_DIR/AGENTS.md" "$tmp"
    write_file "$target" "$tmp"
}

install_codex_agent() {
    source_file=$1
    target_file=$2
    tmp=${target_file}.tmp.$$

    awk '
    BEGIN { in_meta = 0; body = 0; name = ""; description = ""; text = "" }
    NR == 1 && $0 == "---" { in_meta = 1; next }
    in_meta && $0 == "---" { in_meta = 0; body = 1; next }
    in_meta && /^name:[[:space:]]*/ { name = $0; sub(/^name:[[:space:]]*/, "", name); next }
    in_meta && /^description:[[:space:]]*/ { description = $0; sub(/^description:[[:space:]]*/, "", description); next }
    body { text = text $0 "\n" }
    END {
        print "name: " name
        print "description: " description
        print "instructions: |-"
        n = split(text, lines, "\n")
        for (i = 1; i < n; i++) {
            line = lines[i]
            while (match(line, /<skill>[A-Za-z0-9._-]+<\/skill>/)) {
                tag = substr(line, RSTART, RLENGTH)
                skill = tag
                sub(/^<skill>/, "", skill)
                sub(/<\/skill>$/, "", skill)
                line = substr(line, 1, RSTART - 1) "$" skill substr(line, RSTART + RLENGTH)
            }
            print "  " line
        }
    }
    ' "$source_file" > "$tmp" || error "failed to translate $source_file"

    write_file "$target_file" "$tmp"
}

install_codex_agents() {
    [ -d "$INSTRUCTIONS_DIR/agents" ] || return 0

    find "$INSTRUCTIONS_DIR/agents" -type f | while IFS= read -r source_file; do
        relative=${source_file#"$INSTRUCTIONS_DIR/agents"/}
        target_file=.codex/agents/${relative%.*}.yaml
        ensure_parent_dir "$target_file"
        install_codex_agent "$source_file" "$target_file"
    done
}

install_codex() {
    install_main_instruction AGENTS.md '$'
    install_tree "$INSTRUCTIONS_DIR/skills" .codex/skills '$' ''
    install_codex_agents
}

install_claude() {
    install_main_instruction CLAUDE.md '/'
    install_tree "$INSTRUCTIONS_DIR/skills" .claude/skills '/' ''
    install_tree "$INSTRUCTIONS_DIR/agents" .claude/agents '/' ''
}

install_copilot() {
    install_main_instruction .github/copilot-instructions.md '/'
    install_tree "$INSTRUCTIONS_DIR/skills" .github/instructions/skills '/' ''
    install_tree "$INSTRUCTIONS_DIR/agents" .github/instructions/agents '/' ''
}

for tool in $tools; do
    install_$tool
done

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
  cr test [options] [<file> ...]

  Run configured test commands for specified or changed files. At least one
  selector --changed or <file> -- must be provided.

Options:
  -h, --help            Show this help message and exit
  --changed             Run tests for all changed files, git must be available
                        in the current working directory

Arguments:
  <file>                Path to a file to run the tests for
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

fatal() {
    echo "error: $*" >&2
    exit 1
}

add_test_file() {
    if [ -n "$test_files" ]; then
        test_files="${test_files}
$1"
    else
        test_files=$1
    fi

    test_file_count=$((test_file_count + 1))
}

test_changed=false
test_files=
test_file_count=0

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || error "unexpected argument: $1"
            usage
            exit 0
            ;;
        --changed)
            test_changed=true
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
            add_test_file "$1"
            shift
            ;;
    esac
done

while [ "$#" -gt 0 ]; do
    add_test_file "$1"
    shift
done

[ "$test_changed" = true ] || [ "$test_file_count" -gt 0 ] || error "missing selector: provide --changed or <file>"

TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-test.XXXXXX")

cleanup() {
    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

test_map=.coderail/test.map
map_records=$tmp_dir/map-records
paths_file=$tmp_dir/paths
commands_file=$tmp_dir/commands
has_commands_file=$tmp_dir/has-commands
failed_paths_file=$tmp_dir/failed-paths
command_paths_dir=$tmp_dir/command-paths

mkdir "$command_paths_dir"
: > "$map_records"
: > "$paths_file"
: > "$commands_file"
: > "$has_commands_file"
: > "$failed_paths_file"

trim() {
    printf '%s\n' "$1" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

line_exists() {
    line_exists_file=$1
    line_exists_value=$2

    [ -f "$line_exists_file" ] || return 1

    while IFS= read -r line_exists_line || [ -n "$line_exists_line" ]; do
        [ "$line_exists_line" = "$line_exists_value" ] && return 0
    done < "$line_exists_file"

    return 1
}

append_unique_line() {
    append_unique_file=$1
    append_unique_value=$2

    line_exists "$append_unique_file" "$append_unique_value" ||
        printf '%s\n' "$append_unique_value" >> "$append_unique_file"
}

normalize_path() {
    normalize_path_value=$1

    case "$normalize_path_value" in
        /*)
            fatal "absolute paths are not supported"
            ;;
    esac

    while :; do
        case "$normalize_path_value" in
            ./*) normalize_path_value=${normalize_path_value#./} ;;
            *) break ;;
        esac
    done

    [ -n "$normalize_path_value" ] || fatal "empty paths are not supported"
    printf '%s\n' "$normalize_path_value"
}

add_normalized_test_file() {
    normalized_path=$(normalize_path "$1")
    printf '%s\n' "$normalized_path" >> "$paths_file"
}

add_changed_files() {
    changed_file_list=$tmp_dir/changed-files
    : > "$changed_file_list"

    git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
        fatal "--changed requires a git repository"

    git diff --name-only --diff-filter=ACMRTUXB HEAD > "$changed_file_list" 2>/dev/null ||
        git diff --name-only --diff-filter=ACMRTUXB > "$changed_file_list"
    git ls-files --others --exclude-standard >> "$changed_file_list"

    while IFS= read -r changed_file || [ -n "$changed_file" ]; do
        [ -n "$changed_file" ] || continue
        add_test_file "$changed_file"
    done < "$changed_file_list"
}

has_nul_byte() {
    LC_ALL=C od -An -tx1 "$1" | tr ' ' '\n' | grep -Fx 00 >/dev/null 2>&1
}

invalid_test_map() {
    fatal "invalid .coderail/test.map"
}

parse_test_map() {
    current_section=

    [ -f "$test_map" ] || fatal "missing .coderail/test.map"
    [ -r "$test_map" ] || fatal "unreadable .coderail/test.map"
    has_nul_byte "$test_map" && invalid_test_map

    while IFS= read -r raw_line || [ -n "$raw_line" ]; do
        line_without_comment=${raw_line%%#*}
        line=$(trim "$line_without_comment")

        [ -n "$line" ] || continue

        case "$line" in
            \[*\])
                current_section=${line#\[}
                current_section=${current_section%\]}
                [ -n "$current_section" ] || invalid_test_map
                ;;
            \[*)
                invalid_test_map
                ;;
            *)
                [ -n "$current_section" ] || invalid_test_map
                printf '%s\n%s\n' "$current_section" "$line" >> "$map_records"
                ;;
        esac
    done < "$test_map"
}

path_matches_glob() {
    awk -v pattern="$1" -v path="$2" '
        function segment_regex(segment,    i, ch, out) {
            out = ""

            for (i = 1; i <= length(segment); i++) {
                ch = substr(segment, i, 1)

                if (ch == "*") {
                    out = out ".*"
                } else if (ch == "\\" || ch == "." || ch == "^" || ch == "$" ||
                    ch == "+" || ch == "(" || ch == ")" || ch == "[" ||
                    ch == "]" || ch == "{" || ch == "}" || ch == "|" ||
                    ch == "?") {
                    out = out "\\" ch
                } else {
                    out = out ch
                }
            }

            return out
        }

        function match_from(pattern_index, path_index,    regex) {
            if (pattern_index > pattern_count) {
                return path_index > path_count
            }

            if (pattern_parts[pattern_index] == "**") {
                if (match_from(pattern_index + 1, path_index)) {
                    return 1
                }

                if (path_index <= path_count) {
                    return match_from(pattern_index, path_index + 1)
                }

                return 0
            }

            if (path_index > path_count) {
                return 0
            }

            regex = "^" segment_regex(pattern_parts[pattern_index]) "$"
            if (path_parts[path_index] ~ regex) {
                return match_from(pattern_index + 1, path_index + 1)
            }

            return 0
        }

        BEGIN {
            pattern_count = split(pattern, pattern_parts, "/")
            path_count = split(path, path_parts, "/")
            exit match_from(1, 1) ? 0 : 1
        }
    '
}

section_matches_path() {
    section_matches_section=$1
    section_matches_path_value=$2

    [ "$section_matches_section" = default ] ||
        path_matches_glob "$section_matches_section" "$section_matches_path_value"
}

shell_quote() {
    printf "'"
    printf '%s' "$1" | sed "s/'/'\\\\''/g"
    printf "'"
}

expand_path_placeholder() {
    expand_rest=$1
    expand_path=$(shell_quote "$2")
    expand_result=

    while :; do
        case "$expand_rest" in
            *"{path}"*)
                expand_prefix=${expand_rest%%\{path\}*}
                expand_result=$expand_result$expand_prefix$expand_path
                expand_rest=${expand_rest#*\{path\}}
                ;;
            *)
                printf '%s' "$expand_result$expand_rest"
                return
                ;;
        esac
    done
}

add_unique_command() {
    add_command_value=$1
    add_command_index=0

    while IFS= read -r add_command_existing || [ -n "$add_command_existing" ]; do
        add_command_index=$((add_command_index + 1))

        if [ "$add_command_existing" = "$add_command_value" ]; then
            command_index=$add_command_index
            return
        fi
    done < "$commands_file"

    printf '%s\n' "$add_command_value" >> "$commands_file"
    add_command_index=$((add_command_index + 1))
    : > "$command_paths_dir/$add_command_index"
    command_index=$add_command_index
}

collect_commands() {
    while IFS= read -r section && IFS= read -r command; do
        while IFS= read -r path || [ -n "$path" ]; do
            if section_matches_path "$section" "$path"; then
                expanded_command=$(expand_path_placeholder "$command" "$path")
                add_unique_command "$expanded_command"
                append_unique_line "$command_paths_dir/$command_index" "$path"
                append_unique_line "$has_commands_file" "$path"
            fi
        done < "$paths_file"
    done < "$map_records"
}

print_failed_command_output() {
    print_output_command=$1
    print_output_file=$2

    [ "$log_quiet" = 0 ] && [ "$log_verbose" = 1 ] || return 0

    log_notice "failed command: $print_output_command"

    if [ ! -s "$print_output_file" ]; then
        log_notice "failed command output: <empty>"
        return
    fi

    log_notice "failed command output:"

    while IFS= read -r print_output_line || [ -n "$print_output_line" ]; do
        log_notice "$print_output_line"
    done < "$print_output_file"
}

run_commands() {
    run_command_index=0

    while IFS= read -r run_command || [ -n "$run_command" ]; do
        run_command_index=$((run_command_index + 1))
        run_command_output=$tmp_dir/command-output

        set +e
        sh -c "$run_command" > "$run_command_output" 2>&1
        run_command_status=$?
        set -e

        if [ "$run_command_status" -ne 0 ]; then
            print_failed_command_output "$run_command" "$run_command_output"

            while IFS= read -r failed_path || [ -n "$failed_path" ]; do
                append_unique_line "$failed_paths_file" "$failed_path"
            done < "$command_paths_dir/$run_command_index"
        fi
    done < "$commands_file"
}

print_results() {
    results_failed=false

    while IFS= read -r result_path || [ -n "$result_path" ]; do
        if ! line_exists "$has_commands_file" "$result_path"; then
            printf '%s: no tests found\n' "$result_path"
        elif line_exists "$failed_paths_file" "$result_path"; then
            printf '%s: failed\n' "$result_path"
            results_failed=true
        else
            printf '%s: passed\n' "$result_path"
        fi
    done < "$paths_file"

    [ "$results_failed" = false ]
}

if [ "$test_changed" = true ]; then
    add_changed_files
fi

if [ -n "$test_files" ]; then
    input_files=$tmp_dir/input-files
    printf '%s\n' "$test_files" > "$input_files"

    while IFS= read -r test_file || [ -n "$test_file" ]; do
        add_normalized_test_file "$test_file"
    done < "$input_files"
fi

parse_test_map
collect_commands
run_commands
print_results

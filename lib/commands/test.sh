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

usage() {
    cat <<'EOF'
Usage:
  cr test [options] [<file|dir> ...]

  Run configured test commands for specified paths or changed files. At least
  one selector --changed or <file|dir> -- must be provided.

Options:
  -h, --help            Show this help message and exit
  --changed             Run tests for all changed files, git must be available
                        in the current working directory

Arguments:
  <file|dir>            Path to a file, or directory to test recursively
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

    case "$normalize_path_value" in
        ..|../*|*/..|*/../*)
            fatal "parent-directory traversal is not supported"
            ;;
    esac

    printf '%s\n' "$normalize_path_value"
}

add_selected_test_file() {
    printf '%s\n' "$1" >> "$paths_file"
}

add_directory_test_files() {
    directory_path=$1
    directory_paths=$tmp_dir/directory-paths

    find "./$directory_path" -type f -print | sort > "$directory_paths"

    while IFS= read -r directory_file || [ -n "$directory_file" ]; do
        add_selected_test_file "$(normalize_path "$directory_file")"
    done < "$directory_paths"
}

add_normalized_test_file() {
    normalized_path=$(normalize_path "$1")

    if [ -d "$normalized_path" ]; then
        add_directory_test_files "$normalized_path"
    else
        add_selected_test_file "$normalized_path"
    fi
}

append_changed_files() {
    append_changed_files_source=$1

    while IFS= read -r append_changed_file || [ -n "$append_changed_file" ]; do
        [ -n "$append_changed_file" ] || continue
        append_unique_line "$changed_file_list" "$append_changed_file"
    done < "$append_changed_files_source"
}

add_changed_files() {
    changed_file_list=$tmp_dir/changed-files
    changed_file_chunk=$tmp_dir/changed-file-chunk
    : > "$changed_file_list"

    git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
        fatal "--changed requires a git repository"

    if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git diff --name-only --diff-filter=ACMRTUXB HEAD > "$changed_file_chunk"
        append_changed_files "$changed_file_chunk"
    else
        git diff --cached --name-only --diff-filter=ACMRTUXB > "$changed_file_chunk"
        append_changed_files "$changed_file_chunk"

        git diff --name-only --diff-filter=ACMRTUXB > "$changed_file_chunk"
        append_changed_files "$changed_file_chunk"
    fi

    git ls-files --others --exclude-standard > "$changed_file_chunk"
    append_changed_files "$changed_file_chunk"

    while IFS= read -r changed_file || [ -n "$changed_file" ]; do
        [ -n "$changed_file" ] || continue
        case "$changed_file" in
            .coderail/*) continue ;;
        esac
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
    CR_TEST_PATTERN=$1 CR_TEST_PATH=$2 awk '
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
            pattern = ENVIRON["CR_TEST_PATTERN"]
            path = ENVIRON["CR_TEST_PATH"]
            pattern_count = split(pattern, pattern_parts, "/")
            path_count = split(path, path_parts, "/")
            exit match_from(1, 1) ? 0 : 1
        }
    '
}

path_matches_captures() {
    CR_TEST_PATTERN=$1 CR_TEST_PATH=$2 awk '
        function add_token(type, text, name, glob) {
            token_count++
            token_type[token_count] = type
            token_text[token_count] = text
            token_name[token_count] = name
            token_glob[token_count] = glob
        }

        function add_literal(text) {
            if (text == "") {
                return
            }

            if (token_count > 0 && token_type[token_count] == "literal") {
                token_text[token_count] = token_text[token_count] text
                return
            }

            add_token("literal", text, "", "")
        }

        function unescape_literals(value,    i, ch, next_ch, out) {
            out = ""

            for (i = 1; i <= length(value); ) {
                ch = substr(value, i, 1)

                if (ch == "\\") {
                    if (i == length(value)) {
                        parse_error = 1
                        return ""
                    }

                    next_ch = substr(value, i + 1, 1)
                    if (next_ch != "{" && next_ch != "}" && next_ch != "\\") {
                        parse_error = 1
                        return ""
                    }

                    out = out next_ch
                    i += 2
                    continue
                }

                if (ch == "{" || ch == "}") {
                    parse_error = 1
                    return ""
                }

                out = out ch
                i++
            }

            return out
        }

        function parse_pattern(value,    i, j, ch, current, escaped, start, colon, name, glob_raw, glob, literal_start) {
            i = 1

            while (i <= length(value)) {
                ch = substr(value, i, 1)

                if (ch == "{") {
                    start = i + 1
                    colon = 0

                    for (j = start; j <= length(value); j++) {
                        current = substr(value, j, 1)

                        if (current == "}") {
                            break
                        }

                        if (current == "\\") {
                            if (j == length(value)) {
                                return 0
                            }

                            escaped = substr(value, j + 1, 1)
                            if (escaped != "{" && escaped != "}" && escaped != "\\") {
                                return 0
                            }

                            j++
                            continue
                        }

                        if (current == "{") {
                            return 0
                        }

                        if (current == ":" && colon == 0) {
                            colon = j
                        }
                    }

                    if (j > length(value)) {
                        return 0
                    }

                    if (colon == 0) {
                        return 0
                    }

                    name = substr(value, start, colon - start)
                    glob_raw = substr(value, colon + 1, j - colon - 1)
                    parse_error = 0
                    glob = unescape_literals(glob_raw)

                    if (name == "" || glob == "" ||
                        name !~ /^[A-Za-z_][A-Za-z0-9_]*$/ ||
                        parse_error || name in capture_seen) {
                        return 0
                    }

                    add_token("capture", "", name, glob)
                    capture_names[++capture_count] = name
                    capture_seen[name] = 1
                    i = j + 1
                } else if (ch == "\\") {
                    if (i == length(value)) {
                        return 0
                    }

                    escaped = substr(value, i + 1, 1)
                    if (escaped != "{" && escaped != "}" && escaped != "\\") {
                        return 0
                    }

                    add_literal(escaped)
                    i += 2
                } else if (ch == "}") {
                    return 0
                } else if (ch == "*") {
                    if (substr(value, i + 1, 1) == "*") {
                        add_token("globstar", "", "", "")
                        i += 2
                    } else {
                        add_token("star", "", "", "")
                        i++
                    }
                } else {
                    literal_start = i

                    while (i <= length(value)) {
                        ch = substr(value, i, 1)

                        if (ch == "{" || ch == "}" || ch == "\\" || ch == "*") {
                            break
                        }

                        i++
                    }

                    add_literal(substr(value, literal_start, i - literal_start))
                }
            }

            return 1
        }

        function segment_glob_matches(pattern_segment, value_segment) {
            return segment_glob_matches_from(pattern_segment, 1, value_segment, 1)
        }

        function segment_glob_matches_from(pattern_segment, pattern_index, value_segment, value_index,    ch, next_index) {
            if (pattern_index > length(pattern_segment)) {
                return value_index > length(value_segment)
            }

            ch = substr(pattern_segment, pattern_index, 1)

            if (ch == "*") {
                for (next_index = value_index; next_index <= length(value_segment) + 1; next_index++) {
                    if (segment_glob_matches_from(pattern_segment, pattern_index + 1, value_segment, next_index)) {
                        return 1
                    }
                }

                return 0
            }

            if (value_index > length(value_segment)) {
                return 0
            }

            if (substr(value_segment, value_index, 1) != ch) {
                return 0
            }

            return segment_glob_matches_from(pattern_segment, pattern_index + 1, value_segment, value_index + 1)
        }

        function glob_matches(glob, value,    pattern_count, value_count) {
            pattern_count = split(glob, glob_pattern_parts, "/")

            if (value == "") {
                value_count = 0
            } else {
                value_count = split(value, glob_value_parts, "/")
            }

            return glob_segments_match_from(1, 1, pattern_count, value_count)
        }

        function glob_segments_match_from(pattern_index, value_index, pattern_count, value_count) {
            if (pattern_index > pattern_count) {
                return value_index > value_count
            }

            if (glob_pattern_parts[pattern_index] == "**") {
                if (glob_segments_match_from(pattern_index + 1, value_index, pattern_count, value_count)) {
                    return 1
                }

                if (value_index <= value_count) {
                    return glob_segments_match_from(pattern_index, value_index + 1, pattern_count, value_count)
                }

                return 0
            }

            if (value_index > value_count) {
                return 0
            }

            if (segment_glob_matches(glob_pattern_parts[pattern_index], glob_value_parts[value_index])) {
                return glob_segments_match_from(pattern_index + 1, value_index + 1, pattern_count, value_count)
            }

            return 0
        }

        function match_from(token_index, path_index,    type, text, name, glob, next_index, value, had_old_value, old_value) {
            if (token_index > token_count) {
                return path_index > length(path)
            }

            type = token_type[token_index]

            if (type == "literal") {
                text = token_text[token_index]

                if (substr(path, path_index, length(text)) != text) {
                    return 0
                }

                return match_from(token_index + 1, path_index + length(text))
            }

            if (type == "star") {
                for (next_index = path_index; next_index <= length(path) + 1; next_index++) {
                    if (next_index > path_index &&
                        substr(path, next_index - 1, 1) == "/") {
                        break
                    }

                    if (match_from(token_index + 1, next_index)) {
                        return 1
                    }
                }

                return 0
            }

            if (type == "globstar") {
                for (next_index = path_index; next_index <= length(path) + 1; next_index++) {
                    if (match_from(token_index + 1, next_index)) {
                        return 1
                    }
                }

                return 0
            }

            name = token_name[token_index]
            glob = token_glob[token_index]
            had_old_value = name in capture_values
            old_value = capture_values[name]

            for (next_index = path_index; next_index <= length(path) + 1; next_index++) {
                value = substr(path, path_index, next_index - path_index)

                if (glob_matches(glob, value)) {
                    capture_values[name] = value

                    if (match_from(token_index + 1, next_index)) {
                        return 1
                    }
                }
            }

            if (had_old_value) {
                capture_values[name] = old_value
            } else {
                delete capture_values[name]
            }

            return 0
        }

        BEGIN {
            pattern = ENVIRON["CR_TEST_PATTERN"]
            path = ENVIRON["CR_TEST_PATH"]

            if (!parse_pattern(pattern)) {
                exit 2
            }

            if (!match_from(1, 1)) {
                exit 1
            }

            for (i = 1; i <= capture_count; i++) {
                print capture_names[i]
                print capture_values[capture_names[i]]
            }
        }
    '
}

section_matches_path() {
    section_matches_section=$1
    section_matches_path_value=$2
    section_matches_captures_file=$3

    : > "$section_matches_captures_file"

    [ "$section_matches_section" = default ] && return 0

    case "$section_matches_section" in
        *{*|*}*|*\\*)
            if path_matches_captures "$section_matches_section" "$section_matches_path_value" > "$section_matches_captures_file"; then
                return 0
            else
                section_matches_status=$?
            fi

            [ "$section_matches_status" -ne 2 ] || invalid_test_map
            return 1
            ;;
        *)
            path_matches_glob "$section_matches_section" "$section_matches_path_value"
            ;;
    esac
}

shell_quote() {
    printf "'"
    printf '%s' "$1" | sed "s/'/'\\\\''/g"
    printf "'"
}

expand_command_placeholders() {
    expand_command=$1
    expand_captures_file=$2

    {
        printf '%s\n' "$expand_command"

        while IFS= read -r expand_capture_name &&
            IFS= read -r expand_capture_value; do
            printf '%s\n' "$expand_capture_name"
            shell_quote "$expand_capture_value"
            printf '\n'
        done < "$expand_captures_file"
    } | awk '
        NR == 1 { command = $0; next }
        NR % 2 == 0 { names[++name_count] = $0; next }
        { values["{" names[name_count] "}"] = $0; next }

        END {
            rest = command

            while (length(rest) > 0) {
                token = ""
                position = 0

                for (i = 1; i <= name_count; i++) {
                    candidate_token = "{" names[i] "}"
                    candidate_position = index(rest, candidate_token)
                    if (candidate_position > 0 &&
                        (position == 0 || candidate_position < position)) {
                        token = candidate_token
                        position = candidate_position
                    }
                }

                if (position == 0) {
                    printf "%s", rest
                    exit
                }

                printf "%s%s", substr(rest, 1, position - 1), values[token]
                rest = substr(rest, position + length(token))
            }
        }
    '
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
    collect_captures_file=$tmp_dir/captures

    while IFS= read -r section && IFS= read -r command; do
        while IFS= read -r path || [ -n "$path" ]; do
            if section_matches_path "$section" "$path" "$collect_captures_file"; then
                expanded_command=$(expand_command_placeholders "$command" "$collect_captures_file")
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

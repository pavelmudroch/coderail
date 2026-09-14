#!/usr/bin/env sh

TEST_MAP_FILE=".coderail/test_map"

usage()
{
    cat <<'EOF'
Usage:
  cr test [options] [<file|directory> ...]

  Run configured test commands for specified paths or changed files. At least
  one selector --changed or <file|dir> must be provided.

Options:
  -h, --help           Show this help message and exit
  --short             Output only <file> ok/fail for each tested file
  --changed            Run tests for all changed files. Git must be available
                       in the current working directory.

Arguments:
  <file|directory>     File(s) and or directory(ies) to run tests for. Mandatory
                       unless --changed is specified.

Map format:
  [src/${path}/${file}.ts]
  <command to run> tests/${path}/${file}.test.ts

  Each nonempty, noncomment line below a pattern is a shell command.
  Patterns match whole paths relative to the current directory. Named captures
  and * match across directories; ? matches one character. Captures are greedy
  and substituted literally into commands, so quote them as needed in the map.
  Commands referencing captures stop for a file after its first failure.
  Commands without capture references are shared and always run when matched.
  Commands run once after expansion, in file and map order; cached failures
  also stop later files that need that command. Any failure causes a nonzero exit.
  Test commands stream stdout and stderr directly to the corresponding output
  streams, including when a command fails, unless --short is specified.
EOF
}

execute_command()
{
    file_list=""
    changed=0
    short=0

    while [ $# -gt 0 ]; do
        case "$1" in
            -h|--help)
                usage
                exit "$_CR_SUCCESS_EXIT_CODE"
                ;;
            --help=*)
                log_error "--help does not take an argument"
                usage >&2
                exit "$_CR_USAGE_EXIT_CODE"
                ;;
            --short)
                short=1
                shift
                ;;
            --short=*)
                log_error "--short does not take an argument"
                usage >&2
                exit "$_CR_USAGE_EXIT_CODE"
                ;;
            --changed)
                changed=1
                shift
                ;;
            --changed=*)
                log_error "--changed does not take an argument"
                usage >&2
                exit "$_CR_USAGE_EXIT_CODE"
                ;;
            --)
                shift
                break
                ;;
            -*)
                log_error "Unknown option: $1"
                usage >&2
                exit "$_CR_USAGE_EXIT_CODE"
                ;;
            *)
                file_list="$file_list$EOL$1"
                shift
                ;;
        esac
    done

    while [ $# -gt 0 ]; do
        file_list="$file_list$EOL$1"
        shift
    done

    if [ "$changed" -eq 0 ] && [ -z "$file_list" ]; then
        log_error "At least one of --changed or <file|directory> must be specified."
        usage >&2
        exit "$_CR_USAGE_EXIT_CODE"
    fi

    if [ ! -f "$TEST_MAP_FILE" ]; then
        output "No tests found"
        exit "$_CR_SUCCESS_EXIT_CODE"
    fi

    if ! test_map_content=$(cat "$TEST_MAP_FILE"); then
        log_error "Failed to read test map file: $TEST_MAP_FILE"
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if [ "$changed" -eq 1 ]; then
        if ! changed_file_list=$(_get_changed_file_list); then
            log_error "Failed to list changed files. Run --changed inside a Git working tree."
            exit "$_CR_ERROR_EXIT_CODE"
        fi
        file_list="$file_list$EOL$changed_file_list"
    fi

    if ! file_list=$(printf '%s\n' "$file_list" | _expand_test_paths); then
        log_error "Failed to list files for testing"
        exit "$_CR_ERROR_EXIT_CODE"
    fi
    if ! commands=$(printf '%s\n' "$test_map_content" | _collect_test_commands); then
        log_error "Failed to collect test commands"
        exit "$_CR_ERROR_EXIT_CODE"
    fi
    if [ -z "$commands" ]; then
        output "No tests found"
        return "$_CR_SUCCESS_EXIT_CODE"
    fi

    # Inherit stdout and stderr so test output is visible as commands run.
    if sh -c "$commands" < /dev/null; then
        return "$_CR_SUCCESS_EXIT_CODE"
    else
        return "$_CR_ERROR_EXIT_CODE"
    fi
}

_get_changed_file_list()
{
    git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 1
    git -c core.quotepath=false diff --cached --name-only --no-renames --diff-filter=d || return 1
    git -c core.quotepath=false diff --name-only --no-renames --diff-filter=d || return 1
    git -c core.quotepath=false ls-files --others --exclude-standard
}

_expand_test_paths()
{
    while IFS= read -r test_path; do
        [ -n "$test_path" ] || continue
        case "$test_path" in
            "$PWD") test_path=. ;;
            "$PWD"/*) test_path=${test_path#"$PWD"/} ;;
        esac
        if ! normalized_test_path=$(path_normalize_relative "$test_path"); then
            log_error "Invalid test path: $test_path"
            return 1
        fi
        test_path=$normalized_test_path
        if [ -d "$test_path" ]; then
            test_directory_files=$(find "./$test_path" -type f -print) || return 1
            printf '%s\n' "$test_directory_files" | sed 's|^\(\./\)*||'
        else
            printf '%s\n' "$test_path"
        fi
    done
}

_collect_test_commands()
{
    # ENVIRON preserves backslashes in filenames, unlike awk -v assignments.
    CR_TEST_FILES=$file_list awk -v short="$short" '
        # Recursive, greedy matching avoids non-POSIX awk capture extensions.
        function matches(pattern, path,    token, name, rest, size, value) {
            if (pattern == "") return path == ""
            if (match(pattern, /^\$\{[a-zA-Z_][a-zA-Z_0-9]*\}/)) {
                token = substr(pattern, 1, RLENGTH)
                name = substr(token, 3, length(token) - 3)
                rest = substr(pattern, length(token) + 1)
                if (name in captures) {
                    value = captures[name]
                    return substr(path, 1, length(value)) == value &&
                        matches(rest, substr(path, length(value) + 1))
                }
                for (size = length(path); size >= 1; size--) {
                    captures[name] = substr(path, 1, size)
                    if (matches(rest, substr(path, size + 1))) return 1
                    delete captures[name]
                }
                return 0
            }
            token = substr(pattern, 1, 1)
            rest = substr(pattern, 2)
            if (token == "*") {
                for (size = length(path); size >= 0; size--)
                    if (matches(rest, substr(path, size + 1))) return 1
                return 0
            }
            return length(path) > 0 && (token == "?" || token == substr(path, 1, 1)) &&
                matches(rest, substr(path, 2))
        }
        function expand(command,    result, token, name) {
            result = ""
            per_file = 0
            while (match(command, /\$\{[a-zA-Z_][a-zA-Z_0-9]*\}/)) {
                result = result substr(command, 1, RSTART - 1)
                token = substr(command, RSTART, RLENGTH)
                name = substr(token, 3, length(token) - 3)
                if (name in captures) per_file = 1
                result = result ((name in captures) ? captures[name] : token)
                command = substr(command, RSTART + RLENGTH)
            }
            return result command
        }
        # Quote command text for sh -c without interpreting it during collection.
        function quote(command,    result, apostrophe, i, char) {
            apostrophe = sprintf("%c", 39)
            result = apostrophe
            for (i = 1; i <= length(command); i++) {
                char = substr(command, i, 1)
                result = result (char == apostrophe ? apostrophe "\\" apostrophe apostrophe : char)
            }
            return result apostrophe
        }
        function summary(file) {
            if (short && file)
                print "printf " quote("%s %s\n") " " quote(files[file]) " \"$cr_file_status\""
        }
        /^[[:space:]]*(#|$)/ { next }
        {
            line = $0
            sub(/\r$/, "", line)
            if (line ~ /^[[:space:]]*\[.*\][[:space:]]*$/) {
                sub(/^[[:space:]]*\[/, "", line)
                sub(/\][[:space:]]*$/, "", line)
                pattern = line
                next
            }
            if (pattern == "") {
                invalid = 1
                next
            }
            patterns[++count] = pattern
            commands[count] = line
        }
        END {
            if (invalid) exit 1
            total = split(ENVIRON["CR_TEST_FILES"], files, "\n")
            for (f = 1; f <= total; f++) {
                if (files[f] == "" || seen_files[files[f]]++) continue
                for (c = 1; c <= count; c++) {
                    for (name in captures) delete captures[name]
                    if (matches(patterns[c], files[f])) {
                        command = expand(commands[c])
                        if (!(command in command_ids)) {
                            command_ids[command] = ++command_count
                            unique_commands[command_count] = command
                        }
                        steps[++step_count] = command_ids[command]
                        step_files[step_count] = f
                        step_per_file[step_count] = per_file
                    }
                }
            }
            if (!step_count) exit

            # Each unique command has one function and a lazily populated result.
            # Keep every file dependency, including those on duplicate commands.
            print "cr_status=0"
            for (id = 1; id <= command_count; id++) {
                print "unset cr_result_" id
                print "cr_test_" id "() {"
                print "  if [ \"${cr_result_" id "+set}\" != set ]; then"
                print "    if sh -c " quote(unique_commands[id]) " < /dev/null" (short ? " > /dev/null 2>&1" : "") "; then"
                print "      cr_result_" id "=0"
                print "    else"
                print "      cr_result_" id "=1"
                print "    fi"
                print "  fi"
                print "  return \"$cr_result_" id "\""
                print "}"
            }
            for (s = 1; s <= step_count; s++) {
                if (step_files[s] != previous_file) {
                    summary(previous_file)
                    print "cr_file_failed=0"
                    if (short) print "cr_file_status=ok"
                }
                previous_file = step_files[s]
                if (step_per_file[s]) print "if [ \"$cr_file_failed\" -eq 0 ]; then"
                print "if ! cr_test_" steps[s] "; then"
                print "  cr_status=1"
                if (short) print "  cr_file_status=fail"
                if (step_per_file[s]) print "  cr_file_failed=1"
                print "fi"
                if (step_per_file[s]) print "fi"
            }
            summary(previous_file)
            print "exit \"$cr_status\""
        }
    '
}
